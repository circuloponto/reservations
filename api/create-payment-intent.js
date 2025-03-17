import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { amount, reservation_id } = req.body

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      metadata: {
        reservation_id,
      },
    })

    res.status(200).json({ clientSecret: paymentIntent.client_secret })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: error.message })
  }
} 