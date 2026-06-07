import { jsx } from 'react/jsx-runtime';
import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { c as cn } from './progress_C8VRBEN2.mjs';

const Separator = React.forwardRef(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => /* @__PURE__ */ jsx(
    SeparatorPrimitive.Root,
    {
      ref,
      decorative,
      orientation,
      className: cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      ),
      ...props
    }
  )
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator as S };
