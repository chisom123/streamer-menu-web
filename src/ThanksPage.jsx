import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { track } from './posthog';

function ThanksPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    track('viewed_thanks_page', { session_id: sessionId });
  }, [sessionId]);

  return (
    <>
      <style>{`
        .tp-root {
          --page-bg: #FFFFFF; --card-bg: #F5F5F5;
          --primary-text: #111111; --secondary-text: #999999;
          --accent: #FF6B00; --green: #16A34A;
          min-height: 100dvh; display: flex; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased; background: var(--page-bg);
        }
        .tp-root * { box-sizing: border-box; }
        .tp-container {
          width: 100%; max-width: 480px; min-height: 100dvh;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 40px 28px; text-align: center;
        }
        .tp-icon { font-size: 48px; line-height: 1; margin-bottom: 20px; }
        .tp-title { font-size: 24px; font-weight: 800; color: var(--primary-text); margin: 0 0 10px; letter-spacing: -0.3px; }
        .tp-sub { font-size: 15px; color: var(--secondary-text); line-height: 1.6; margin: 0 0 28px; max-width: 320px; }
        .tp-download-btn {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--accent); color: #fff; border: none;
          padding: 14px 28px; border-radius: 999px; font-size: 16px; font-weight: 700;
          cursor: pointer; text-decoration: none;
        }
      `}</style>

      <div className="tp-root">
        <div className="tp-container">
          <span className="tp-icon" role="img" aria-label="Party popper">🎉</span>
          <h1 className="tp-title">Watch your order on the app</h1>
          <p className="tp-sub">
            You will be notified when the livestream starts.
          </p>

          <a
            className="tp-download-btn"
            href="https://apps.apple.com/app/socialstar/id6473705189?ppid=76a5812e-a07f-442f-a232-0cafa5ff1348"
            onClick={() => track('clicked_download_from_thanks', { session_id: sessionId })}
          >
            Download SocialStar
          </a>
        </div>
      </div>
    </>
  );
}

export default ThanksPage;