import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import PaymentForm from './components/PaymentForm'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [tables, setTables] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [selectedTable, setSelectedTable] = useState(null)
  const [selectedItems, setSelectedItems] = useState([])
  const [error, setError] = useState(null)
  const [tableLayout] = useState([
    { row: 1, tables: [1, 2, 3] },
    { row: 2, tables: [4, 5, 6] },
  ])
  const [cart, setCart] = useState([])
  const [cartTotal, setCartTotal] = useState(0)
  const [showPayment, setShowPayment] = useState(false)
  const [currentReservationId, setCurrentReservationId] = useState(null)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    // Subscribe to real-time updates for reservations
    const reservationsSubscription = supabase
      .channel('reservations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'reservations',
      }, payload => {
        console.log('Reservation change:', payload)
        // Refresh tables data when reservations change
        if (selectedDate && selectedTime) {
          fetchTables()
        }
      })
      .subscribe()

    // Fetch menu items
    fetchMenuItems()

    return () => {
      subscription.unsubscribe()
      reservationsSubscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (selectedDate && selectedTime) {
      fetchTables()
    }
  }, [selectedDate, selectedTime])

  const fetchTables = async () => {
    try {
      // Also fetch current reservations for availability checking
      const { data: tablesData, error: tablesError } = await supabase
        .from('tables')
        .select('*')
      
      if (tablesError) throw tablesError

      const { data: reservationsData, error: reservationsError } = await supabase
        .from('reservations')
        .select('*')
        .gte('reservation_date', new Date().toISOString().split('T')[0])
        // Add time check for reservations
        .eq('reservation_date', selectedDate)
        .eq('reservation_time', selectedTime)
      
      if (reservationsError) throw reservationsError

      // Mark tables as unavailable if they're reserved for the selected time
      const availableTables = tablesData.map(table => ({
        ...table,
        isAvailable: !reservationsData?.some(
          res => res.table_id === table.id
        )
      }))

      setTables(availableTables)
    } catch (err) {
      setError('Failed to fetch tables')
      console.error('Error:', err)
    }
  }

  const fetchMenuItems = async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
    
    if (error) {
      console.error('Error fetching menu items:', error)
    } else {
      setMenuItems(data)
    }
  }

  const handleReservation = async () => {
    if (!session) {
      alert('Please sign in to make a reservation')
      return
    }

    if (!selectedTable || !selectedDate || !selectedTime) {
      alert('Please select a table, date, and time')
      return
    }

    try {
      // Log the data we're trying to insert
      console.log('Attempting to create reservation with:', {
        table_id: selectedTable,
        reservation_date: selectedDate,
        reservation_time: selectedTime,
        status: 'pending',
        user_id: session.user.id,
        customer_email: session.user.email
      })

      const { data, error } = await supabase
        .from('reservations')
        .insert([
          {
            table_id: selectedTable,
            reservation_date: selectedDate,
            reservation_time: selectedTime,
            status: 'pending',
            user_id: session.user.id,
            customer_email: session.user.email
          }
        ])
        .select() // Add this to get the inserted data back

      if (error) {
        console.error('Reservation Error:', error)
        throw error
      }

      console.log('Reservation created:', data)
      setCurrentReservationId(data[0].id)
      setShowPayment(true) // Show payment form after successful reservation
      
      // Reset selection after successful reservation
      setSelectedTable(null)
      setSelectedDate('')
      setSelectedTime('')
      
      // Create order if items are selected
      if (selectedItems.length > 0) {
        console.log('Creating order for items:', selectedItems)
        
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert([
            {
              reservation_id: data[0].id,
              status: 'pending',
              total_amount: selectedItems.reduce((sum, item) => sum + item.price, 0)
            }
          ])
          .select()

        if (orderError) {
          console.error('Order Error:', orderError)
          throw orderError
        }

        // Create order items
        const orderItems = selectedItems.map(item => ({
          order_id: orderData[0].id,
          menu_item_id: item.id,
          quantity: 1,
          price_at_time: item.price
        }))

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems)

        if (itemsError) {
          console.error('Order Items Error:', itemsError)
          throw itemsError
        }
        
        // Reset selected items after successful order
        setSelectedItems([])
      }
    } catch (err) {
      alert(`Error making reservation: ${err.message}`)
      console.error('Full Error:', err)
    }
  }

  const addToCart = (item) => {
    const existingItem = cart.find(cartItem => cartItem.id === item.id)
    
    if (existingItem) {
      // If item exists, increment quantity
      setCart(cart.map(cartItem => 
        cartItem.id === item.id 
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      ))
    } else {
      // If item doesn't exist, add it with quantity 1
      setCart([...cart, { ...item, quantity: 1 }])
    }
  }

  const removeFromCart = (itemId) => {
    setCart(cart.filter(item => item.id !== itemId))
  }

  const updateQuantity = (itemId, newQuantity) => {
    if (newQuantity < 1) {
      removeFromCart(itemId)
      return
    }
    
    setCart(cart.map(item => 
      item.id === itemId 
        ? { ...item, quantity: newQuantity }
        : item
    ))
  }

  useEffect(() => {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    setCartTotal(total)
    setSelectedItems(cart) // Update selectedItems for the reservation system
  }, [cart])

  const handlePaymentSuccess = async () => {
    try {
      // Update reservation status to confirmed
      await supabase
        .from('reservations')
        .update({ status: 'confirmed' })
        .eq('id', currentReservationId)

      setShowPayment(false)
      setCurrentReservationId(null)
      setCart([])
      alert('Payment successful! Your reservation is confirmed.')
    } catch (error) {
      console.error('Error updating reservation:', error)
    }
  }

  return (
    <div className="app-container">
      {!session ? (
        <Auth />
      ) : (
        <>
          <h1>Restaurant Reservation System</h1>
          {error && <div className="error-message">{error}</div>}
          
          <div className="reservation-section">
            <h2>Make a Reservation</h2>
            <input
              type="date"
              min={new Date().toISOString().split('T')[0]}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
            />
            
            <div className="restaurant-layout">
              <h3>Table Layout</h3>
              {tableLayout.map((row, rowIndex) => (
                <div key={rowIndex} className="table-row">
                  {row.tables.map(tableNumber => {
                    const table = tables.find(t => t.number === tableNumber);
                    const isAvailable = table?.isAvailable;
                    const isSelected = selectedTable === table?.id;
                    
                    return (
                      <div
                        key={tableNumber}
                        className={`table ${!isAvailable ? 'unavailable' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => isAvailable ? setSelectedTable(table.id) : null}
                      >
                        <span className="table-number">Table {tableNumber}</span>
                        <span className="table-status">
                          {isAvailable ? 'Available' : 'Reserved'}
                        </span>
                        {table?.capacity && (
                          <span className="table-capacity">
                            {table.capacity} seats
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <button 
              onClick={handleReservation}
              disabled={!selectedTable || !selectedDate || !selectedTime}
              className="confirm-button"
            >
              Confirm Reservation
            </button>
          </div>

          <div className="menu-and-cart-section">
            <div className="menu-section">
              <h2>Menu Items</h2>
              <div className="menu-grid">
                {menuItems.map(item => (
                  <div key={item.id} className="menu-item">
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <p className="price">${item.price.toFixed(2)}</p>
                    <button 
                      onClick={() => addToCart(item)}
                      className="add-to-cart-button"
                    >
                      Add to Order
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="cart-section">
              <h2>Your Order</h2>
              {cart.length === 0 ? (
                <p>Your cart is empty</p>
              ) : (
                <>
                  <div className="cart-items">
                    {cart.map(item => (
                      <div key={item.id} className="cart-item">
                        <div className="cart-item-details">
                          <h4>{item.name}</h4>
                          <p>${item.price.toFixed(2)} each</p>
                        </div>
                        <div className="cart-item-controls">
                          <button 
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="quantity-button"
                          >
                            -
                          </button>
                          <span className="quantity">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="quantity-button"
                          >
                            +
                          </button>
                          <button 
                            onClick={() => removeFromCart(item.id)}
                            className="remove-button"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="cart-item-total">
                          ${(item.price * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="cart-total">
                    <h3>Total: ${cartTotal.toFixed(2)}</h3>
                  </div>
                </>
              )}
            </div>
          </div>

          {showPayment && (
            <div className="payment-overlay">
              <div className="payment-modal">
                <h2>Complete Your Reservation</h2>
                <PaymentForm 
                  amount={cartTotal}
                  onSuccess={handlePaymentSuccess}
                  reservationId={currentReservationId}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
