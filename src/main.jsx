import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MenuPage from './MenuPage';
import ThanksPage from './ThanksPage';
import { initPosthog } from './posthog';

initPosthog();

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/o/:streamerId" element={<MenuPage />} />
        <Route path="/thanks" element={<ThanksPage />} />
        <Route path="*" element={<div style={{ padding: 40, fontFamily: 'sans-serif' }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
