import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeft, Minus, Plus, ShoppingCart } from 'lucide-react';
import { functions } from './firebase';
import { track, setStreamerContext } from './posthog';

const MIN_ORDER_TOTAL = 5;
const MAX_QTY = 20;

function MenuPage() {
  const { streamerId } = useParams();

  const [profile, setProfile] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [cart, setCart] = useState({}); // menuItemId -> quantity
  const [cartOpen, setCartOpen] = useState(false);
  const [nameScreenOpen, setNameScreenOpen] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [countryCode, setCountryCode] = useState('1'); // '1' = US, '44' = UK
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [bump, setBump] = useState(false); // brief bounce on the bar when something's added

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, menuRes] = await Promise.all([
          httpsCallable(functions, 'getStreamerPublicProfile')({ streamerId }),
          httpsCallable(functions, 'getMenu')({ streamerId })
        ]);
        if (cancelled) return;

        if (!profileRes.data?.exists) {
          setNotFound(true);
          return;
        }

        const p = { name: profileRes.data.name, avatarUrl: profileRes.data.avatarUrl };
        setProfile(p);
        setMenuItems(menuRes.data?.items ?? []);
        setMenuCategories(menuRes.data?.categories ?? []);
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

  const categoryNameById = useMemo(() => {
    const map = {};
    for (const cat of menuCategories) map[cat.id] = cat.name;
    return map;
  }, [menuCategories]);

  // Group items by category, preserving category sortOrder, with any
  // uncategorized items (categoryId null, or pointing at a category that
  // no longer exists) collected into a trailing "Menu" bucket.
  const categorized = useMemo(() => {
    const orderedCategories = [...menuCategories].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );

    const groups = {};
    for (const cat of orderedCategories) groups[cat.name] = [];

    const uncategorized = [];
    for (const item of menuItems) {
      const name = item.categoryId ? categoryNameById[item.categoryId] : undefined;
      if (name && groups[name]) {
        groups[name].push(item);
      } else {
        uncategorized.push(item);
      }
    }
    if (uncategorized.length > 0) groups['Menu'] = uncategorized;

    // Drop any empty categories (e.g. a category with no active items)
    for (const key of Object.keys(groups)) {
      if (groups[key].length === 0) delete groups[key];
    }
    return groups;
  }, [menuItems, menuCategories, categoryNameById]);

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

  // National numbers are sometimes typed with a leading trunk 0 (common in
  // the UK, e.g. "07911 123456"). PhoneNumberKit strips that on the app side
  // before producing E.164, so we mirror that here — otherwise the same
  // phone number would hash differently on web vs. app and matchOrdersOnSignup
  // would never find it.
  const rawDigits = buyerPhone.replace(/\D/g, '');
  const nationalDigits = countryCode === '44' && rawDigits.startsWith('0')
    ? rawDigits.slice(1)
    : rawDigits;
  const isValidPhone = nationalDigits.length === 10;
  const buyerPhoneE164 = `+${countryCode}${nationalDigits}`;

  const canSubmit = meetsMinimum && buyerName.trim().length > 0 && isValidPhone && !submitting;
  const progressPct = Math.min(100, (total / MIN_ORDER_TOTAL) * 100);

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
      setBump(true);
      setTimeout(() => setBump(false), 160);
    } else {
      track('removed_menu_item', { streamer_id: streamerId, item_id: item.id, item_name: item.name, quantity: next });
    }
  }

  function openCart() {
    track('opened_cart', { streamer_id: streamerId, item_count: itemCount, total });
    setCartOpen(true);
  }

  function goToNameScreen() {
    if (!meetsMinimum) return;
    track('proceeded_to_checkout_details', { streamer_id: streamerId, item_count: itemCount, total });
    setNameScreenOpen(true);
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
      const fn = httpsCallable(functions, 'createWebOrderCheckout');
      const res = await fn({
        streamerId,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhoneE164,
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
          --danger: #E24B4A; --green: #16A34A; --divider: #E5E5E5;
          min-height: 100dvh; color: var(--primary-text);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .mp-root * { box-sizing: border-box; }

        /* Full-bleed on any phone. Only becomes a centered, card-like
           column once the viewport is wide enough that edge-to-edge text
           would look bad (i.e. desktop) — not before. */
        .mp-root { background: var(--page-bg); }
        .mp-container { width: 100%; min-height: 100dvh; position: relative; background: var(--page-bg); }

        @media (min-width: 560px) {
          .mp-root { background: var(--card-bg); display: flex; justify-content: center; }
          .mp-container { max-width: 480px; min-height: 100dvh; box-shadow: 0 0 40px rgba(0,0,0,0.06); }
        }

        .mp-scroll { padding: 0 20px 110px; }
        .mp-header { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 36px 0 28px; }
        .mp-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: var(--card-bg); margin-bottom: 12px; }
        .mp-avatar-fallback { width: 64px; height: 64px; border-radius: 50%; background: var(--card-bg); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 24px; color: var(--secondary-text); margin-bottom: 12px; }
        .mp-livepill { display: inline-block; background: var(--danger); color: #fff; font-size: 13px; font-weight: 800; padding: 6px 14px; border-radius: 999px; }
        .mp-slogan { font-size: 26px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.15; margin: 0 0 12px; }

        .mp-category-row { display: flex; align-items: center; gap: 10px; margin: 26px 0 10px; }
        .mp-category-row:first-of-type { margin-top: 4px; }
        .mp-category { font-size: 12px; font-weight: 800; color: var(--secondary-text); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
        .mp-category-rule { flex: 1; height: 0; border-bottom: 2px dotted var(--divider); transform: translateY(2px); }

        .mp-item { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--card-bg); }
        .mp-item:last-child { border-bottom: none; }
        .mp-item-main { flex: 1; min-width: 0; }
        .mp-item-name { font-size: 15px; font-weight: 700; color: var(--primary-text); margin: 0; }
        .mp-item-price { font-size: 13px; font-weight: 700; color: var(--accent); margin: 2px 0; }
        .mp-item-desc { font-size: 12px; color: var(--secondary-text); margin: 0; line-height: 1.4; }
        .mp-qty { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .mp-qtybtn { width: 28px; height: 28px; border-radius: 50%; border: none; background: var(--card-bg); color: var(--primary-text); font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.12s ease; }
        .mp-qtybtn:active:not(:disabled) { transform: scale(0.88); }
        .mp-qtybtn.add { background: var(--accent); color: #fff; }
        .mp-qtybtn:disabled { opacity: 0.4; cursor: not-allowed; }
        .mp-qtynum { min-width: 16px; text-align: center; font-size: 14px; font-weight: 700; }

        .mp-bar {
          position: fixed; left: 0; right: 0; bottom: 0;
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px calc(14px + env(safe-area-inset-bottom)); background: var(--primary-text); color: #fff;
          cursor: pointer; border: none; width: 100%; z-index: 30;
          transition: transform 0.15s ease;
        }
        .mp-bar.bump { transform: scale(1.02); }
        .mp-bar-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .mp-bar-text { flex: 1; text-align: left; min-width: 0; }
        .mp-bar-label { font-size: 15px; font-weight: 700; display: block; }
        .mp-bar-total { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.65); display: block; margin-top: 1px; }
        .mp-badge { background: var(--accent); border-radius: 50%; width: 26px; height: 26px; font-size: 13px; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }

        .mp-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45);
          opacity: 0; pointer-events: none; transition: opacity 0.2s ease; z-index: 10;
        }
        .mp-overlay.open { opacity: 1; pointer-events: auto; }
        .mp-sheet {
          position: fixed; left: 0; right: 0; bottom: 0; max-height: 86dvh;
          background: #fff; border-radius: 20px 20px 0 0; z-index: 20;
          transform: translateY(calc(100% + 40px)); transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
          display: flex; flex-direction: column;
          box-shadow: 0 -8px 30px rgba(0,0,0,0.2);
        }
        .mp-sheet.open { transform: translateY(0); }

        @media (min-width: 560px) {
          .mp-bar, .mp-sheet { left: 50%; right: auto; width: 100%; max-width: 480px; transform: translateX(-50%); }
          .mp-bar.bump { transform: translateX(-50%) scale(1.02); }
          .mp-sheet.open { transform: translateX(-50%) translateY(0); }
          .mp-sheet:not(.open) { transform: translateX(-50%) translateY(calc(100% + 40px)); }
        }

        .mp-sheet-handle { width: 36px; height: 4px; background: var(--divider); border-radius: 2px; margin: 10px auto 4px; flex-shrink: 0; }
        .mp-sheet-head { text-align: center; padding: 8px 20px 14px; border-bottom: 2px dashed var(--divider); flex-shrink: 0; }
        .mp-sheet-head .name { font-size: 19px; font-weight: 800; color: var(--primary-text); }
        .mp-sheet-head .sub { font-size: 11px; color: var(--secondary-text); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
        .mp-sheet-scroll { overflow-y: auto; padding: 6px 20px 0; flex: 1; min-height: 0; }

        .mp-line { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 0; border-bottom: 1px dotted var(--divider); gap: 10px; }
        .mp-line-name { font-size: 13px; font-weight: 700; color: var(--primary-text); }
        .mp-line-qty { font-size: 11px; color: var(--secondary-text); }
        .mp-remove { background: none; border: none; color: var(--danger); font-size: 11px; font-weight: 700; padding: 0; margin-top: 4px; cursor: pointer; }
        .mp-line-price { font-size: 13px; font-weight: 700; color: var(--primary-text); white-space: nowrap; }
        .mp-empty-cart { text-align: center; color: var(--secondary-text); font-size: 13px; padding: 30px 0; line-height: 1.6; }

        .mp-fieldlabel { font-size: 12px; font-weight: 700; color: var(--secondary-text); margin: 18px 0 8px; }
        .mp-input { width: 100%; background: var(--input-bg); border: none; border-radius: 12px; padding: 15px 14px; font-size: 16px; font-weight: 600; color: var(--primary-text); font-family: inherit; outline: none; }

        .mp-phone-row { display: flex; align-items: stretch; }
        .mp-country-select-wrap { position: relative; flex-shrink: 0; display: flex; }
        .mp-country-select {
          appearance: none; -webkit-appearance: none; -moz-appearance: none;
          border: none; background: #DCDCDC; border-radius: 12px 0 0 12px;
          padding: 15px 14px; font-size: 16px; font-weight: 700; text-align: center;
          color: var(--primary-text); font-family: inherit; outline: none; cursor: pointer;
        }
        .mp-phone-input { flex: 1; min-width: 0; border-radius: 0 12px 12px 0; }
        .mp-phone-hint { font-size: 11px; color: var(--secondary-text); margin: 8px 0 0; line-height: 1.4; }

        .mp-sheet-footer { padding: 14px 20px calc(22px + env(safe-area-inset-bottom)); border-top: 1px solid var(--divider); background: #fff; }
        .mp-progress-track { height: 6px; background: var(--card-bg); border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
        .mp-progress-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; }
        .mp-minnote { font-size: 12px; color: var(--danger); text-align: center; margin-bottom: 10px; font-weight: 600; }
        .mp-total-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
        .mp-total-label { font-size: 13px; color: var(--secondary-text); font-weight: 600; }
        .mp-total-value { font-size: 20px; font-weight: 800; color: var(--primary-text); }
        .mp-primarybtn { width: 100%; padding: 16px; border-radius: 999px; font-size: 16px; font-weight: 700; background: var(--accent); color: #fff; border: none; margin-top: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .mp-primarybtn:disabled { background: var(--disabled-bg); color: var(--disabled-text); cursor: not-allowed; }
        .mp-btn-spinner {
          width: 15px; height: 15px; border-radius: 50%; flex-shrink: 0;
          border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;
          animation: mp-spin 0.7s linear infinite;
        }
        .mp-primarybtn:disabled .mp-btn-spinner { border-color: rgba(0,0,0,0.12); border-top-color: var(--secondary-text); }
        .mp-footnote { text-align: center; font-size: 11px; color: var(--secondary-text); margin-top: 12px; line-height: 1.5; }
        .mp-error { color: var(--danger); font-size: 13px; font-weight: 600; margin-top: 10px; text-align: center; }

        .mp-centered { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--secondary-text); font-size: 15px; font-weight: 600; text-align: center; padding: 0 30px; }

        /* Full-screen name step, slides in over everything */
        .mp-namescreen {
          position: fixed; inset: 0; background: var(--page-bg); z-index: 40;
          display: flex; flex-direction: column;
          transform: translateY(calc(100dvh + 40px)); transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .mp-namescreen.open { transform: translateY(0); }
        .mp-namescreen-scroll { flex: 1; padding: 20px 20px calc(24px + env(safe-area-inset-bottom)); overflow-y: auto; }
        .mp-namescreen-back {
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--secondary-text); margin-bottom: 24px;
          background: none; border: none; padding: 4px; margin-left: -4px;
          cursor: pointer;
        }
        .mp-namescreen-title { font-size: 22px; font-weight: 800; margin: 0 0 24px; letter-spacing: -0.3px; }
        .mp-namescreen-sub { font-size: 13px; color: var(--secondary-text); margin: 0 0 28px; line-height: 1.5; }

        @media (min-width: 560px) {
          .mp-namescreen { left: 50%; right: auto; width: 100%; max-width: 480px; margin-left: -240px; }
        }
        .mp-spinner {
          width: 44px; height: 44px; border-radius: 50%;
          border: 4px solid var(--card-bg); border-top-color: var(--accent);
          animation: mp-spin 0.7s linear infinite;
        }
        @keyframes mp-spin { to { transform: rotate(360deg); } }
        .mp-empty { text-align: center; color: var(--secondary-text); font-size: 13px; padding: 40px 0; }
      `}</style>

      {loading ? (
        <div className="mp-root mp-centered">
          <div className="mp-spinner" />
        </div>
      ) : notFound ? (
        <div className="mp-root mp-centered">This request page isn't available.</div>
      ) : loadError ? (
        <div className="mp-root mp-centered">{loadError}</div>
      ) : (
        <div className="mp-root">
          <div className="mp-container">
            <div className="mp-scroll">
              <div className="mp-header">
                {profile.avatarUrl ? (
                  <img className="mp-avatar" src={profile.avatarUrl} alt={profile.name} />
                ) : (
                  <div className="mp-avatar-fallback">{profile.name.charAt(0).toUpperCase()}</div>
                )}
                <h1 className="mp-slogan">Watch {profile.name}</h1>
                <span className="mp-livepill">LIVE</span>
              </div>

              {menuItems.length === 0 ? (
                <div className="mp-empty">No menu items available right now.</div>
              ) : (
                Object.entries(categorized).map(([category, items]) => (
                  <div key={category}>
                    <div className="mp-category-row">
                      <span className="mp-category">{category}</span>
                      <span className="mp-category-rule" />
                    </div>
                    {items.map((item) => {
                      const qty = cart[item.id] ?? 0;
                      return (
                        <div className="mp-item" key={item.id}>
                          <div className="mp-item-main">
                            <p className="mp-item-name">{item.name}</p>
                            <p className="mp-item-price">${Number(item.price).toFixed(2)}</p>
                            {item.description && <p className="mp-item-desc">{item.description}</p>}
                          </div>
                          <div className="mp-qty">
                            <button
                              className="mp-qtybtn"
                              disabled={qty === 0}
                              onClick={() => bumpQty(item, -1)}
                              aria-label={`Remove one ${item.name}`}
                            >
                              <Minus size={14} strokeWidth={3.25} />
                            </button>
                            <span className="mp-qtynum">{qty}</span>
                            <button
                              className="mp-qtybtn add"
                              disabled={qty >= MAX_QTY}
                              onClick={() => bumpQty(item, 1)}
                              aria-label={`Add one ${item.name}`}
                            >
                              <Plus size={14} strokeWidth={3.25} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {itemCount > 0 && !cartOpen && (
              <button className={`mp-bar ${bump ? 'bump' : ''}`} onClick={openCart}>
                <span className="mp-bar-icon">
                  <ShoppingCart size={20} strokeWidth={2} />
                </span>
                <span className="mp-bar-text">
                  <span className="mp-bar-label">View order</span>
                  <span className="mp-bar-total">${total.toFixed(2)}</span>
                </span>
                <span className="mp-badge">{itemCount}</span>
              </button>
            )}

            <div className={`mp-overlay ${cartOpen ? 'open' : ''}`} onClick={() => setCartOpen(false)} />

            <div className={`mp-sheet ${cartOpen ? 'open' : ''}`}>
              <div className="mp-sheet-handle" />

              <div className="mp-sheet-head">
                <div className="name">Order for {profile.name}</div>
                <div className="sub">{itemCount === 0 ? 'Nothing yet' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}</div>
              </div>

              <div className="mp-sheet-scroll">
                {cartLines.length === 0 ? (
                  <div className="mp-empty-cart">Nothing in your order yet.<br />Tap + on anything from the menu.</div>
                ) : (
                  cartLines.map((line) => (
                    <div className="mp-line" key={line.menuItemId}>
                      <div>
                        <div className="mp-line-name">{line.name}</div>
                        <div className="mp-line-qty">x{line.quantity}</div>
                        <button className="mp-remove" onClick={() => setQty(line.menuItemId, 0)}>
                          Remove
                        </button>
                      </div>
                      <div className="mp-line-price">${(line.price * line.quantity).toFixed(2)}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="mp-sheet-footer">
                {!meetsMinimum && cartLines.length > 0 && (
                  <>
                    <div className="mp-progress-track">
                      <div className="mp-progress-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="mp-minnote">
                      Add ${(MIN_ORDER_TOTAL - total).toFixed(2)} more to hit the ${MIN_ORDER_TOTAL} minimum
                    </div>
                  </>
                )}
                <div className="mp-total-row">
                  <span className="mp-total-label">Total</span>
                  <span className="mp-total-value">${total.toFixed(2)}</span>
                </div>

                <button className="mp-primarybtn" disabled={!meetsMinimum} onClick={goToNameScreen}>
                  Checkout
                </button>
                <div className="mp-footnote">
                  Minimum ${MIN_ORDER_TOTAL} order. You'll be redirected to a secure payment page.
                </div>
              </div>
            </div>

            <div className={`mp-namescreen ${nameScreenOpen ? 'open' : ''}`}>
              <div className="mp-namescreen-scroll">
                <button
                  className="mp-namescreen-back"
                  onClick={() => setNameScreenOpen(false)}
                  aria-label="Back to order"
                >
                  <ArrowLeft size={24} strokeWidth={2.5} />
                </button>
                <h1 className="mp-namescreen-title">Your details</h1>

                <div className="mp-fieldlabel">Name</div>
                <input
                  className="mp-input"
                  placeholder="e.g. Mia"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  autoFocus
                />

                <div className="mp-fieldlabel">Phone number</div>
                <div className="mp-phone-row">
                  <div className="mp-country-select-wrap">
                    <select
                      className="mp-country-select"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      aria-label="Country code"
                    >
                      <option value="1">🇺🇸 +1</option>
                      <option value="44">🇬🇧 +44</option>
                    </select>
                  </div>
                  <input
                    className="mp-input mp-phone-input"
                    type="tel"
                    inputMode="numeric"
                    placeholder={countryCode === '44' ? '07911 123456' : '(555) 123-4567'}
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                  />
                </div>

                {submitError && <div className="mp-error">{submitError}</div>}
                <button className="mp-primarybtn" disabled={!canSubmit} onClick={submitOrder}>
                  {submitting && <span className="mp-btn-spinner" />}
                  {submitting ? 'Redirecting to payment...' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MenuPage;