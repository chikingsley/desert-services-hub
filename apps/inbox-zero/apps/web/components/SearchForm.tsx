"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import {
  type MessageQuery,
  messageQuerySchema,
} from "@/app/api/messages/validation";
import { Input } from "@/components/Input";

export function SearchForm({
  defaultQuery,
  onSearch,
}: {
  defaultQuery?: string;
  onSearch: (query: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MessageQuery>({
    resolver: zodResolver(messageQuerySchema),
    defaultValues: {
      q: defaultQuery,
    },
  });

  const onSubmit: SubmitHandler<MessageQuery> = useCallback(
    async (data) => {
      onSearch(data.q || "");
    },
    [onSearch]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        className="flex-1"
        error={errors.q}
        name="search"
        placeholder="Search emails..."
        registerProps={register("q")}
        type="text"
      />
    </form>
  );
}
