import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  emptyText?: string
  className?: string
  /** 是否允許輸入清單以外的自由文字（例如全新客戶／品名），預設允許 */
  allowFreeText?: boolean
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "請選擇",
  emptyText = "查無符合選項",
  className,
  allowFreeText = true,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  // 是否已在本次開啟中輸入過：僅在輸入後才依內容過濾，
  // 讓已有選定值的欄位每次點選都能看到完整選項，不需先清空才能重選
  const [typing, setTyping] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const query = typing ? value.trim() : ''
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options
  const showFreeTextOption = allowFreeText && query.length > 0 && !options.includes(query)

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTyping(false)
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setTyping(true)
            if (!open) setOpen(true)
          }}
          onFocus={() => {
            setTyping(false)
            setOpen(true)
          }}
          // 選定後輸入框仍保有焦點，onFocus 不會再次觸發；改由點擊直接重新開啟完整選單
          onClick={() => {
            if (!open) {
              setTyping(false)
              setOpen(true)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className,
          )}
        />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            if (inputRef.current && e.target instanceof Node && inputRef.current.contains(e.target)) {
              e.preventDefault()
            }
          }}
          onFocusOutside={(e) => {
            if (inputRef.current && e.target instanceof Node && inputRef.current.contains(e.target)) {
              e.preventDefault()
            }
          }}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 && !showFreeTextOption && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</p>
            )}
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt)
                  setTyping(false)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  opt === value && "bg-accent/60",
                )}
              >
                <Check className={cn("size-4 shrink-0", opt === value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{opt}</span>
              </button>
            ))}
            {showFreeTextOption && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(value.trim())
                  setTyping(false)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-brand outline-none hover:bg-accent"
              >
                使用「{value.trim()}」
              </button>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
