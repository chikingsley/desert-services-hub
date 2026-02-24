import { cva } from "class-variance-authority";
import clsx from "clsx";
import type React from "react";

interface ContainerProps {
  children: React.ReactNode;
  size?: "lg" | "2xl" | "4xl" | "6xl";
}

const containerVariants = cva("mx-auto w-full px-4", {
  variants: {
    size: {
      lg: "max-w-lg",
      "2xl": "max-w-2xl",
      "4xl": "max-w-4xl",
      "6xl": "max-w-6xl",
    },
  },
});

export const Container = (props: ContainerProps) => {
  const { children, size = "4xl" } = props;
  return <div className={clsx(containerVariants({ size }))}>{children}</div>;
};
Container.displayName = "Container";
