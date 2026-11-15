import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './appearance.css';
import './recording-layout.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
