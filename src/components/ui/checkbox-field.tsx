import * as React from "react";
import { cn } from "@/lib/utils";

interface CheckboxFieldProps extends Omit<React.ComponentProps<"input">, "type"> {
  label: React.ReactNode;
  /** Toelichting onder het label. */
  description?: React.ReactNode;
}

/**
 * Aanvinkveld met label. Het vakje is een gewone checkbox (zodat toetsenbord en
 * schermlezer werken zoals verwacht); de rij eromheen is het aanraakvlak, want
 * een vinkje van 16px is met een duim niet te raken.
 */
const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const generated = React.useId();
    const inputId = id ?? generated;

    return (
      <div className={cn("flex min-h-11 items-start gap-3 py-1 sm:min-h-0", className)}>
        <input
          {...props}
          ref={ref}
          id={inputId}
          type="checkbox"
          className="mt-0.5 h-6 w-6 shrink-0 sm:h-5 sm:w-5 cursor-pointer rounded border-2 border-input text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <label htmlFor={inputId} className="cursor-pointer select-none text-sm leading-6">
          <span className="text-foreground">{label}</span>
          {description && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          )}
        </label>
      </div>
    );
  }
);
CheckboxField.displayName = "CheckboxField";

export { CheckboxField };
