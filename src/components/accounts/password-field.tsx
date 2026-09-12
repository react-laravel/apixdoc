"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function PasswordField({
  id,
  label,
  value,
  onChange,
  newPassword = false,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  newPassword?: boolean;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={newPassword ? "new-password" : "current-password"}
          required
          disabled={disabled}
          className="pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-0 size-9"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? `隐藏${label}` : `显示${label}`}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
