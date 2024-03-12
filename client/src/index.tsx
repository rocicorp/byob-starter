import React from 'react';
import ReactDOM from 'react-dom/client';

async function init() {
  function Root() {
    return <div>helo world!</div>;
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

await init();
