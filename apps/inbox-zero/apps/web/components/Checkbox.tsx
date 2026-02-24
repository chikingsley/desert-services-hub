import { forwardRef } from "react";

export const Checkbox = forwardRef(
  (
    props: {
      checked: boolean;
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    },
    ref: React.Ref<HTMLInputElement>
  ) => {
    return (
      <input
        checked={props.checked}
        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-black focus:ring-black"
        onChange={props.onChange}
        ref={ref}
        type="checkbox"
      />
    );
  }
);

Checkbox.displayName = "Checkbox";
