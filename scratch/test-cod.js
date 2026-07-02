(async () => {
  try {
    const res = await fetch('https://klixyrdhwlloswsspmqk.supabase.co/functions/v1/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            productId: '00000000-0000-0000-0000-000000000001',
            name: 'Test Product',
            price: 100,
            quantity: 1,
            size: 'M',
            color: 'Red',
            image: ''
          }
        ],
        shippingAddress: {
          name: 'John Doe',
          line1: '123 Test St',
          city: 'Test City'
        },
        paymentMethod: 'cod',
        shippingMethod: 'standard',
        subtotal: 100,
        shippingFee: 0,
        discount: 0,
        total: 100
      })
    });
    
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch (err) {
    console.error(err);
  }
})();
