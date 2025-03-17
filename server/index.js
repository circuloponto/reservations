require('dotenv').config()
const express = require('express')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const cors = require('cors')

const app = express()
app.use(express.json())
app.use(cors())

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, reservation_id } = req.body

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects amounts in cents
      currency: 'usd',
      metadata: {
        reservation_id,
      },
    })

    res.json({
      clientSecret: paymentIntent.client_secret,
    })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: error.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})