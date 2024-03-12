import {nanoid} from 'nanoid';
import React, {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {DeepReadonlyObject, Replicache, TEST_LICENSE_KEY} from 'replicache';
import {M, mutators} from './mutators.js';
import {Message} from 'shared';
import {useSubscribe} from 'replicache-react';

async function init() {
  // See https://doc.replicache.dev/licensing for how to get a license key.
  const licenseKey =
    import.meta.env.VITE_REPLICACHE_LICENSE_KEY || TEST_LICENSE_KEY;
  if (!licenseKey) {
    throw new Error('Missing VITE_REPLICACHE_LICENSE_KEY');
  }

  function Root() {
    const [r, setR] = useState<Replicache<M> | null>(null);

    useEffect(() => {
      console.log('updating replicache');
      const r = new Replicache({
        name: 'chat-user-id',
        licenseKey,
        mutators,
        pushURL: `/api/replicache/push`,
        pullURL: `/api/replicache/pull`,
        logLevel: 'debug',
      });
      setR(r);
      return () => {
        void r.close();
      };
    }, []);

    const messages = useSubscribe(
      r,
      async tx => {
        const list = await tx
          .scan<Message>({prefix: 'message/'})
          .entries()
          .toArray();
        list.sort(([, {order: a}], [, {order: b}]) => a - b);
        return list;
      },
      {default: []},
    );

    const usernameRef = useRef<HTMLInputElement>(null);
    const contentRef = useRef<HTMLInputElement>(null);

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const last = (messages.length &&
        messages[messages.length - 1][1]) as DeepReadonlyObject<Message>;
      const order = (last?.order ?? 0) + 1;

      const username = usernameRef.current?.value ?? '';
      const content = contentRef.current?.value ?? '';

      if (r) {
        await r.mutate.createMessage({
          id: nanoid(),
          from: username,
          content,
          order,
        });
      }
      if (contentRef.current) {
        contentRef.current.value = '';
      }
    };

    return (
      <div>
        <form onSubmit={onSubmit}>
          <input ref={usernameRef} required /> says:{' '}
          <input ref={contentRef} required /> <input type="submit" />
        </form>
        {messages.map(([k, v]) => (
          <div key={k}>
            <b>{v.from}: </b>
            {v.content}
          </div>
        ))}
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

await init();
