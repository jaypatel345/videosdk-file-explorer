// React entry point. Mounts the App into #root.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './react/App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
