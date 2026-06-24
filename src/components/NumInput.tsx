import { useState, useEffect, useRef } from 'react'

interface NumInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null | undefined
  onChange: (value: number | null) => void
  allowEmpty?: boolean
}

/**
 * Controlled number input that keeps a local text state to prevent
 * the "revert on clear / decimal-point disappears" bug caused by
 * React normalising the value on every keystroke.
 * - While typing: text is stored locally, parent state is not touched.
 * - On blur: text is parsed and onChange(number) is called.
 *   If text is empty and allowEmpty=true → onChange(null).
 *   If text is invalid or empty with allowEmpty=false → reverts to last committed value.
 */
export function NumInput({ value, onChange, allowEmpty = false, onBlur, ...props }: NumInputProps) {
  const toText = (v: number | null | undefined): string =>
    v != null && !isNaN(v) ? String(v) : ''

  const [text, setText] = useState(() => toText(value))
  const committed = useRef(value)

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setText(toText(value))
    }
  }, [value])

  return (
    <input
      {...props}
      type="number"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={e => {
        const n = parseFloat(text)
        if (!isNaN(n)) {
          committed.current = n
          onChange(n)
        } else if (text.trim() === '' && allowEmpty) {
          committed.current = null
          onChange(null)
        } else {
          setText(toText(committed.current))
        }
        onBlur?.(e)
      }}
    />
  )
}
