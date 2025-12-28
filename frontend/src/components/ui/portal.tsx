import * as React from 'react'
import * as ReactDOM from 'react-dom'

export const RootPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return ReactDOM.createPortal(children, document.body)
}
