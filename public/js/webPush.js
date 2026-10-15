// Push notifications for this browser: turned on and off from the profile page,
// and forgotten on sign-out (the head script in layout.hbs).

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function sameKey(a, b) {
  if (!a || a.byteLength !== b.byteLength) return false;
  const left = new Uint8Array(a);
  return left.every((byte, i) => byte === b[i]);
}

const webPush = {
  /** iOS has no PushManager until the app is installed, and plain http has no service worker. */
  supported() {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  async current() {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? registration.pushManager.getSubscription() : null;
  },

  /** True when this browser is subscribed for the signed-in user, not only for whoever signed in here before. */
  async isOn() {
    const subscription = await this.current();
    if (!subscription) return false;
    const response = await fetch('/notification/subscribed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    return response.ok && (await response.json()).subscribed === true;
  },

  /** Resolves to the permission: only 'granted' means this browser is now subscribed. */
  async subscribe() {
    // First, while the click still counts as the user's own: Firefox and
    // Safari refuse a prompt that comes after an await.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission;

    // ready never settles where the worker could not register (some private modes).
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error('No service worker')), 10000),
      ),
    ]);
    const publicKey = await fetch('/notification/vapid-public-key').then((r) =>
      r.text(),
    );
    const key = urlBase64ToUint8Array(publicKey);
    let subscription = await registration.pushManager.getSubscription();
    // One made with another key (the shared pair before 1.1.0) cannot be sent to.
    if (
      subscription &&
      !sameKey(subscription.options.applicationServerKey, key)
    ) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });

    const response = await fetch('/notification/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
    if (!response.ok) {
      await subscription.unsubscribe();
      throw new Error(`Subscribing answered ${response.status}`);
    }
    return permission;
  },

  /** Tells the server first, while the session still exists, then the browser. */
  async unsubscribe() {
    const subscription = await this.current();
    if (!subscription) return;
    await fetch('/notification/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  },
};

/** The profile page's control. Its texts are on the section's data attributes. */
export async function wireUpPushToggle(section) {
  if (!section || section.dataset.ready || !webPush.supported()) return;
  section.dataset.ready = 'true';
  const button = section.querySelector('button');
  const status = section.querySelector('[role=status]');
  const texts = section.dataset;

  const show = (on) => {
    // The label says what a press does, so it is not also a pressed toggle.
    button.textContent = on ? texts.turnOff : texts.turnOn;
    button.dataset.on = String(on);
  };
  const say = (text) => {
    status.textContent = text;
  };

  const denied = () => Notification.permission === 'denied';
  const on = await webPush.isOn().catch(() => false);
  show(on);
  if (!on && denied()) say(texts.blocked);
  section.hidden = false;

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (button.dataset.on === 'true') {
        await webPush.unsubscribe();
        show(false);
        say(texts.off);
      } else {
        const permission = await webPush.subscribe();
        show(permission === 'granted');
        say(
          permission === 'granted'
            ? texts.on
            : denied()
              ? texts.blocked
              : texts.off,
        );
      }
    } catch (err) {
      console.warn('Web push:', err);
      show(await webPush.isOn().catch(() => false));
      say(texts.failed);
    } finally {
      button.disabled = false;
    }
  });
}

export default webPush;
