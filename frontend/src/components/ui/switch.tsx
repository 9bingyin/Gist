import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const MotionThumb = motion.create(SwitchPrimitives.Thumb);

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(
  (
    { className, checked, defaultChecked, onCheckedChange, disabled, ...props },
    ref,
  ) => {
    const [uncontrolledChecked, setUncontrolledChecked] = React.useState(
      defaultChecked ?? false,
    );
    const [isTapped, setIsTapped] = React.useState(false);

    const isControlled = checked !== undefined;
    const currentChecked = isControlled ? checked : uncontrolledChecked;

    const handleChange = React.useCallback(
      (value: boolean) => {
        if (!isControlled) {
          setUncontrolledChecked(value);
        }
        onCheckedChange?.(value);
      },
      [isControlled, onCheckedChange],
    );

    const thumbWidth = !disabled && isTapped ? 20 : 16;

    return (
      <SwitchPrimitives.Root
        className={cn(
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
          className,
        )}
        checked={currentChecked}
        disabled={disabled}
        onCheckedChange={handleChange}
        onMouseDown={() => {
          if (!disabled) setIsTapped(true);
        }}
        onMouseUp={() => setIsTapped(false)}
        onMouseLeave={() => setIsTapped(false)}
        {...props}
        ref={ref}
      >
        <MotionThumb
          className="pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0"
          initial={false}
          animate={{
            translateX: currentChecked ? 16 : 0,
            width: thumbWidth,
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
          }}
        />
      </SwitchPrimitives.Root>
    );
  },
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
