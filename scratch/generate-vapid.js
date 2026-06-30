import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();
console.log('Generated VAPID Keys:');
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
