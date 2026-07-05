import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { track, setStreamerContext } from './posthog';

const MIN_ORDER_TOTAL = 5;
const MAX_QTY = 20;

function MenuPage() {
  const { streamerId } = useParams();

  const [profile, setProfile] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [cart, setCart] = useState({}); // menuItemId -> quantity
  const [view, setView] = useState('menu'); // 'menu' | 'cart'
  const [buyerName, setBuyerName] = useState('');
  const [buyerContact, setBuyerContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, menuRes] = await Promise.all([
          httpsCallable(functions, 'getStreamerPublicProfile')({ streamerId }),
          httpsCallable(functions, 'getMenu')({})
        ]);
        if (cancelled) return;

        if (!profileRes.data?.exists) {
          setNotFound(true);
          return;
        }

        const p = { name: profileRes.data.name, avatarUrl: profileRes.data.avatarUrl };
        setProfile(p);
        setMenuItems(menuRes.data?.items ?? []);
        setStreamerContext(streamerId, p.name);
        track('viewed_menu', { streamer_id: streamerId });
      } catch (e) {
        if (!cancelled) setLoadError(e?.message ?? 'Something went wrong loading this page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamerId]);

  const itemsById = useMemo(() => {
    const map = {};
    for (const item of menuItems) map[item.id] = item;
    return map;
  }, [menuItems]);

  const categorized = useMemo(() => {
    const groups = {};
    for (const item of menuItems) {
      const cat = item.category || 'Menu';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [menuItems]);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, quantity]) => ({
        menuItemId,
        quantity,
        name: itemsById[menuItemId]?.name ?? 'Item',
        price: itemsById[menuItemId]?.price ?? 0
      }));
  }, [cart, itemsById]);

  const itemCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
  const total = cartLines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const meetsMinimum = total >= MIN_ORDER_TOTAL;
  const canSubmit = meetsMinimum && buyerName.trim().length > 0 && !submitting;

  function setQty(itemId, qty) {
    const clamped = Math.max(0, Math.min(MAX_QTY, qty));
    setCart((prev) => {
      const next = { ...prev };
      if (clamped === 0) {
        delete next[itemId];
      } else {
        next[itemId] = clamped;
      }
      return next;
    });
  }

  function bumpQty(item, delta) {
    const current = cart[item.id] ?? 0;
    const next = current + delta;
    setQty(item.id, next);
    if (delta > 0) {
      track('added_menu_item', { streamer_id: streamerId, item_id: item.id, item_name: item.name, quantity: next });
    } else if (delta < 0 && current > 0) {
      track('removed_menu_item', { streamer_id: streamerId, item_id: item.id, item_name: item.name, quantity: next });
    }
  }

  function goToCart() {
    track('opened_cart', { streamer_id: streamerId, item_count: itemCount, total });
    setView('cart');
  }

  async function submitOrder() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    track('submitted_order', {
      streamer_id: streamerId,
      item_count: itemCount,
      total,
      items: cartLines.map((l) => ({ name: l.name, quantity: l.quantity }))
    });
    try {
      const fn = httpsCallable(functions, 'createOrderCheckout');
      const res = await fn({
        streamerId,
        buyerName: buyerName.trim(),
        buyerContact: buyerContact.trim() || null,
        items: cartLines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity }))
      });
      const url = res.data?.url;
      if (!url) throw new Error('No checkout URL returned');
      track('redirected_to_checkout', { streamer_id: streamerId, total });
      window.location.href = url;
    } catch (e) {
      const message = e?.message ?? 'Something went wrong. Please try again.';
      setSubmitError(message);
      track('order_submit_failed', { streamer_id: streamerId, error: message });
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{`
        .mp-root {
          --page-bg: #FFFFFF; --card-bg: #F5F5F5; --input-bg: #E8E8E8;
          --primary-text: #111111; --secondary-text: #999999;
          --accent: #FF6B00; --disabled-bg: #EBEBEB; --disabled-text: #C7C7C7;
          --danger: #E24B4A; --green: #16A34A;
          min-height: 100vh; background: var(--page-bg); color: var(--primary-text);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
          display: flex; justify-content: center;
        }
        .mp-root * { box-sizing: border-box; }
        .mp-container { width: 100%; max-width: 480px; display: flex; flex-direction: column; min-height: 100vh; }
        .mp-scroll { flex: 1; padding: 0 20px 100px; overflow-y: auto; }
        .mp-header { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 40px 0 24px; }
        .mp-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; background: var(--card-bg); margin-bottom: 10px; }
        .mp-avatar-fallback { width: 56px; height: 56px; border-radius: 50%; background: var(--card-bg); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; color: var(--secondary-text); margin-bottom: 10px; }
        .mp-eyebrow { font-size: 12px; color: var(--secondary-text); font-weight: 600; margin-bottom: 2px; }
        .mp-title { font-size: 21px; font-weight: 800; margin: 0; letter-spacing: -0.2px; }
        .mp-category { font-size: 12px; font-weight: 800; color: var(--secondary-text); text-transform: uppercase; letter-spacing: 0.04em; margin: 22px 0 8px; }
        .mp-category:first-of-type { margin-top: 4px; }
        .mp-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--card-bg); }
        .mp-item-main { flex: 1; min-width: 0; }
        .mp-item-name { font-size: 14px; font-weight: 700; color: var(--primary-text); margin: 0 0 2px; }
        .mp-item-desc { font-size: 12px; color: var(--secondary-text); margin: 0; line-height: 1.4; }
        .mp-item-price { font-size: 13px; font-weight: 700; color: var(--accent); white-space: nowrap; margin-left: 6px; }
        .mp-qty { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .mp-qtybtn { width: 28px; height: 28px; border-radius: 50%; border: none; background: var(--card-bg); color: var(--primary-text); font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .mp-qtybtn.add { background: var(--accent); color: #fff; }
        .mp-qtybtn:disabled { opacity: 0.4; cursor: not-allowed; }
        .mp-qtynum { min-width: 16px; text-align: center; font-size: 14px; font-weight: 700; }
        .mp-bar { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: var(--primary-text); color: #fff; cursor: pointer; border: none; width: 100%; max-width: 480px; }
        .mp-bar-count { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
        .mp-badge { background: var(--accent); border-radius: 50%; width: 20px; height: 20px; font-size: 11px; display: flex; align-items: center; justify-content: center; font-weight: 700; }
        .mp-bar-total { font-size: 16px; font-weight: 800; }
        .mp-back { display: inline-flex; align-items: center; gap: 6px; color: var(--secondary-text); font-size: 13px; font-weight: 700; margin: 20px 0 16px; background: none; border: none; padding: 0; cursor: pointer; }
        .mp-line { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--card-bg); gap: 10px; }
        .mp-line-name { font-size: 13px; font-weight: 700; color: var(--primary-text); }
        .mp-line-qty { font-size: 11px; color: var(--secondary-text); }
        .mp-remove { background: none; border: none; color: var(--danger); font-size: 11px; font-weight: 700; padding: 0; margin-top: 4px; cursor: pointer; }
        .mp-line-price { font-size: 13px; font-weight: 700; color: var(--primary-text); white-space: nowrap; }
        .mp-fieldlabel { font-size: 12px; font-weight: 700; color: var(--secondary-text); margin: 20px 0 8px; }
        .mp-input { width: 100%; background: var(--input-bg); border: none; border-radius: 12px; padding: 12px 14px; font-size: 14px; font-weight: 600; color: var(--primary-text); font-family: inherit; outline: none; }
        .mp-input:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
        .mp-summary { background: var(--card-bg); border-radius: 14px; padding: 14px; margin-top: 18px; }
        .mp-summaryrow { display: flex; justify-content: space-between; font-size: 13px; }
        .mp-summaryrow.total { font-weight: 800; font-size: 16px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ddd; }
        .mp-minnote { font-size: 12px; color: var(--danger); text-align: center; margin-top: 10px; font-weight: 600; }
        .mp-primarybtn { width: 100%; padding: 16px; border-radius: 999px; font-size: 15px; font-weight: 700; background: var(--accent); color: #fff; border: none; margin-top: 20px; cursor: pointer; }
        .mp-primarybtn:disabled { background: var(--disabled-bg); color: var(--disabled-text); cursor: not-allowed; }
        .mp-footnote { text-align: center; font-size: 11px; color: var(--secondary-text); margin-top: 12px; line-height: 1.5; }
        .mp-error { color: var(--danger); font-size: 13px; font-weight: 600; margin-top: 12px; text-align: center; }
        .mp-centered { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: var(--secondary-text); font-size: 15px; font-weight: 600; text-align: center; padding: 0 30px; }
        .mp-empty { text-align: center; color: var(--secondary-text); font-size: 13px; padding: 40px 0; }
      `}</style>

      {loading ? (
        <div className="mp-root mp-centered">Loading…</div>
      ) : notFound ? (
        <div className="mp-root mp-centered">This request page isn't available.</div>
      ) : loadError ? (
        <div className="mp-root mp-centered">{loadError}</div>
      ) : (
        <div className="mp-root">
          <div className="mp-container">
            <div className="mp-scroll">
              {view === 'menu' ? (
                <>
                  <div className="mp-header">
                    {profile.avatarUrl ? (
                      <img className="mp-avatar" src={profile.avatarUrl} alt={profile.name} />
                    ) : (
                      <div className="mp-avatar-fallback">{profile.name.charAt(0).toUpperCase()}</div>
                    )}
                    <div className="mp-eyebrow">Build a request for</div>
                    <h1 className="mp-title">{profile.name}</h1>
                  </div>

                  {menuItems.length === 0 ? (
                    <div className="mp-empty">No menu items available right now.</div>
                  ) : (
                    Object.entries(categorized).map(([category, items]) => (
                      <div key={category}>
                        <div className="mp-category">{category}</div>
                        {items.map((item) => {
                          const qty = cart[item.id] ?? 0;
                          return (
                            <div className="mp-item" key={item.id}>
                              <div className="mp-item-main">
                                <p className="mp-item-name">
                                  {item.name} <span className="mp-item-price">${Number(item.price).toFixed(2)}</span>
                                </p>
                                {item.description && <p className="mp-item-desc">{item.description}</p>}
                              </div>
                              <div className="mp-qty">
                                <button
                                  className="mp-qtybtn"
                                  disabled={qty === 0}
                                  onClick={() => bumpQty(item, -1)}
                                  aria-label={`Remove one ${item.name}`}
                                >
                                  –
                                </button>
                                <span className="mp-qtynum">{qty}</span>
                                <button
                                  className="mp-qtybtn add"
                                  disabled={qty >= MAX_QTY}
                                  onClick={() => bumpQty(item, 1)}
                                  aria-label={`Add one ${item.name}`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </>
              ) : (
                <>
                  <button className="mp-back" onClick={() => setView('menu')}>
                    ← Back to menu
                  </button>
                  <h1 className="mp-title" style={{ textAlign: 'left', marginBottom: 4 }}>
                    Your order for {profile.name}
                  </h1>

                  {cartLines.length === 0 ? (
                    <div className="mp-empty">Your cart is empty.</div>
                  ) : (
                    cartLines.map((line) => (
                      <div className="mp-line" key={line.menuItemId}>
                        <div>
                          <div className="mp-line-name">{line.name}</div>
                          <div className="mp-line-qty">×{line.quantity}</div>
                          <button
                            className="mp-remove"
                            onClick={() => {
                              track('removed_menu_item', { streamer_id: streamerId, item_id: line.menuItemId, item_name: line.name, quantity: 0 });
                              setQty(line.menuItemId, 0);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="mp-line-price">${(line.price * line.quantity).toFixed(2)}</div>
                      </div>
                    ))
                  )}

                  <div className="mp-fieldlabel">Your name</div>
                  <input
                    className="mp-input"
                    placeholder="So they know who sent it"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />

                  <div className="mp-fieldlabel">Email or phone (optional)</div>
                  <input
                    className="mp-input"
                    placeholder="In case we need to reach you"
                    value={buyerContact}
                    onChange={(e) => setBuyerContact(e.target.value)}
                  />

                  <div className="mp-summary">
                    <div className="mp-summaryrow">
                      <span>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                    <div className="mp-summaryrow total">
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>

                  {!meetsMinimum && cartLines.length > 0 && (
                    <div className="mp-minnote">
                      Add ${(MIN_ORDER_TOTAL - total).toFixed(2)} more to hit the ${MIN_ORDER_TOTAL} minimum
                    </div>
                  )}

                  {submitError && <div className="mp-error">{submitError}</div>}

                  <button className="mp-primarybtn" disabled={!canSubmit} onClick={submitOrder}>
                    {submitting ? 'Redirecting to payment…' : `Pay $${total.toFixed(2)}`}
                  </button>
                  <div className="mp-footnote">
                    Minimum ${MIN_ORDER_TOTAL} order. You'll be redirected to a secure payment page.
                  </div>
                </>
              )}
            </div>

            {view === 'menu' && itemCount > 0 && (
              <button className="mp-bar" onClick={goToCart}>
                <span className="mp-bar-count">
                  <span className="mp-badge">{itemCount}</span> item{itemCount === 1 ? '' : 's'}
                </span>
                <span className="mp-bar-total">${total.toFixed(2)}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default MenuPage;