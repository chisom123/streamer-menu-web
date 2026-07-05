import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { track } from './posthog';

// Replace with your real App Store listing once live.
const APP_STORE_URL = 'https://apps.apple.com/app/socialstar/id6473705189';

function ThanksPage() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [status, setStatus] = useState('loading');
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      return;
    }
    (async () => {
      try {
        const fn = httpsCallable(functions, 'confirmCheckoutSession');
        const res = await fn({ sessionId });
        if (res.data?.paid) {
          setStatus('paid');
          setOrder(res.data.order);
          track('thanks_page_viewed', {
            streamer_id: res.data.order?.streamerId,
            total: res.data.order?.total
          });
        } else {
          setStatus('unpaid');
          track('checkout_confirmation_failed', { session_id: sessionId, reason: 'unpaid' });
        }
      } catch (e) {
        setStatus('error');
        track('checkout_confirmation_failed', { session_id: sessionId, reason: 'error', error: e?.message });
      }
    })();
  }, [sessionId]);

  return (
    <>
      <style>{`
        .tp-root {
          --page-bg: #FFFFFF; --card-bg: #F5F5F5; --primary-text: #111111;
          --secondary-text: #999999; --accent: #FF6B00; --green: #16A34A;
          min-height: 100vh; background: var(--page-bg); color: var(--primary-text);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
          display: flex; justify-content: center; padding: 0 0 60px;
        }
        .tp-root * { box-sizing: border-box; }
        .tp-container { width: 100%; max-width: 480px; padding: 0 20px; }
        .tp-header { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 0 24px; }
        .tp-checkcircle { width: 52px; height: 52px; border-radius: 50%; background: var(--green); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; margin-bottom: 14px; }
        .tp-eyebrow { font-size: 13px; color: var(--secondary-text); font-weight: 600; letter-spacing: 0.3px; margin-bottom: 4px; }
        .tp-title { font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.2px; text-align: center; }
        .tp-summary-card { background: var(--card-bg); border-radius: 14px; padding: 14px; margin-top: 8px; }
        .tp-line { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; }
        .tp-line-name { font-weight: 600; color: var(--primary-text); }
        .tp-line-qty { color: var(--secondary-text); font-size: 11px; margin-left: 4px; }
        .tp-line-price { font-weight: 700; color: var(--primary-text); }
        .tp-total-row { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ddd; font-weight: 800; font-size: 15px; }
        .tp-field-label { font-size: 13px; font-weight: 700; color: var(--secondary-text); margin: 28px 0 8px; }
        .tp-body-text { font-size: 14px; color: var(--secondary-text); font-weight: 500; line-height: 1.6; margin: 0; }
        .tp-primary-button { width: 100%; padding: 17px; border-radius: 999px; font-size: 16px; font-weight: 700; background: var(--accent); color: #fff; margin-top: 26px; text-align: center; display: block; text-decoration: none; }
      `}</style>
      <div className="tp-root">
        <div className="tp-container">
          <div className="tp-header">
            {status === 'paid' && <div className="tp-checkcircle">✓</div>}
            <div className="tp-eyebrow">
              {status === 'loading' && 'One sec…'}
              {status === 'paid' && "You're all set"}
              {(status === 'unpaid' || status === 'error') && 'Payment not confirmed'}
            </div>
            <h1 className="tp-title">
              {status === 'loading' && 'Confirming payment'}
              {status === 'paid' && `Sent to ${order?.streamerName ?? 'them'}`}
              {(status === 'unpaid' || status === 'error') && "We couldn't confirm that payment"}
            </h1>
          </div>

          {status === 'paid' && order && (
            <>
              <div className="tp-summary-card">
                {order.items?.map((item, i) => (
                  <div className="tp-line" key={i}>
                    <span className="tp-line-name">
                      {item.name}
                      <span className="tp-line-qty">×{item.quantity}</span>
                    </span>
                    <span className="tp-line-price">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="tp-total-row">
                  <span>Total</span>
                  <span>${Number(order.total).toFixed(2)}</span>
                </div>
              </div>

              <div className="tp-field-label">What happens next</div>
              <p className="tp-body-text">
                {order.streamerName} will reach out to set up a time to film these live. Download the app to get
                notified and watch when they go live.
              </p>

              <a
                className="tp-primary-button"
                href={APP_STORE_URL}
                onClick={() => track('download_app_clicked', { streamer_id: order.streamerId })}
              >
                Download the app
              </a>
            </>
          )}

          {(status === 'unpaid' || status === 'error') && (
            <p className="tp-body-text" style={{ textAlign: 'center', marginTop: 20 }}>
              If you were charged, hang tight — reach out and we'll sort it out.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export default ThanksPage;