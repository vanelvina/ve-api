import Razorpay from 'razorpay';

async function test() {
  try {
    const instance = new Razorpay({
      key_id: 'rzp_test_T4zZQVBp7r9f4R',
      key_secret: 'IBUFRM8TYVbRygQk8MMgwwld',
    });

    const options = {
      amount: 50000,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`
    };

    const order = await instance.orders.create(options);
    console.log("Success:", order);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
