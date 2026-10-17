import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import * as engine from './sim/engine';
import { useSimStore } from './state/useSimStore';

// ช่องทางควบคุมสำหรับทดสอบ (เฉพาะ dev)
if (import.meta.env.DEV) Object.assign(window, { __store: useSimStore, __engine: engine });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
