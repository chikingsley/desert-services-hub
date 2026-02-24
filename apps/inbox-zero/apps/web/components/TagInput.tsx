"use client";

import { XIcon } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils";

interface TagInputProps {
  className?: string;
  error?: string | null;
  id?: string;
  label?: string;
  onChange: (value: string[]) => void;
  placeholder?: string;
  validate?: (value: string) => string | null;
  value: string[];
}

export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  validate,
  className,
  id,
  label,
  error,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = useCallback(
    (tag: string) => {
      const trimmedTag = tag.trim();
      if (!trimmedTag) {
        return;
      }

      if (validate) {
        const validationError = validate(trimmedTag);
        if (validationError) {
          setInputError(validationError);
          return;
        }
      }

      if (value.includes(trimmedTag)) {
        setInputError("This value has already been added");
        return;
      }

      onChange([...value, trimmedTag]);
      setInputValue("");
      setInputError(null);
    },
    [value, onChange, validate]
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onChange(value.filter((tag) => tag !== tagToRemove));
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(inputValue);
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        e.preventDefault();
        removeTag(value[value.length - 1]);
      }
    },
    [inputValue, addTag, value, removeTag]
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (newValue.includes(",")) {
        const parts = newValue.split(",");
        for (const part of parts) {
          addTag(part);
        }
      } else {
        setInputValue(newValue);
        setInputError(null);
      }
    },
    [addTag]
  );

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  }, [inputValue, addTag]);

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const displayError = error || inputError;

  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block font-medium text-sm" htmlFor={id}>
          {label}
        </label>
      )}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: clicking focuses the input which handles keyboard events */}
      <div
        className={cn(
          "flex min-h-[42px] w-full cursor-text flex-wrap gap-1.5 rounded-md border border-input bg-background p-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          displayError && "border-destructive"
        )}
        onClick={handleContainerClick}
      >
        {value.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1.5 pl-2.5 text-secondary-foreground text-sm"
            key={tag}
          >
            {tag}
            <button
              aria-label={`Remove ${tag}`}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary-foreground/10"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[120px] flex-1 border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground focus:ring-0"
          id={id}
          onBlur={handleBlur}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          ref={inputRef}
          type="text"
          value={inputValue}
        />
      </div>
      {displayError && (
        <p className="mt-1.5 text-destructive text-sm">{displayError}</p>
      )}
    </div>
  );
}
