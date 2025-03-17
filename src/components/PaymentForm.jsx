import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const CheckoutForm = ({ amount, onSuccess, reservationId }) => {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    
    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        throw submitError
      }

      const { error: paymentError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
      })

      if (paymentError) {
        throw paymentError
      }

      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <PaymentElement />
      {error && <div className="payment-error">{error}</div>}
      <button 
        type="submit" 
        disabled={!stripe || processing}
        className="payment-button"
      >
        {processing ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
      </button>
    </form>
  )
}

export default function PaymentForm({ amount, onSuccess, reservationId }) {
  const [clientSecret, setClientSecret] = useState(null)

  useEffect(() => {
    const fetchPaymentIntent = async () => {
      try {
        const response = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            reservation_id: reservationId,
          }),
        })

        const data = await response.json()
        setClientSecret(data.clientSecret)
      } catch (error) {
        console.error('Error creating payment intent:', error)
      }
    }

    if (amount > 0) {
      fetchPaymentIntent()
    }
  }, [amount, reservationId])

  if (!clientSecret) {
    return <div>Loading payment form...</div>
  }

  return (
    <div className="payment-container">
      <Elements 
        stripe={stripePromise} 
        options={{
          clientSecret,
          appearance: {
            theme: 'stripe',
          },
        }}
      >
        <CheckoutForm 
          amount={amount} 
          onSuccess={onSuccess}
          reservationId={reservationId}
        />
      </Elements>
    </div>
  )
} 