import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('FordOS app error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error">
          <span><AlertTriangle size={28} /></span>
          <h3>{this.props.name || 'App'} hit an error</h3>
          <p>{this.state.error.message || String(this.state.error)}</p>
          <button type="button" className="btn ghost" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
