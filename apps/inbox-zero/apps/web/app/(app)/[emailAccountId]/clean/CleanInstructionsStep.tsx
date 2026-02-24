"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { useSkipSettings } from "@/app/(app)/[emailAccountId]/clean/useSkipSettings";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";
import { Input } from "@/components/Input";
import { Toggle } from "@/components/Toggle";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";

const schema = z.object({ instructions: z.string().optional() });

type Inputs = z.infer<typeof schema>;

export function CleanInstructionsStep() {
  const { onNext } = useStep();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });
  const [_, setInstructions] = useQueryState("instructions", parseAsString);
  const [showCustom, setShowCustom] = useState(false);
  const [skipStates, setSkipStates] = useSkipSettings();

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    if (showCustom) {
      setInstructions(data.instructions || "");
    }
    onNext();
  };

  return (
    <form className="text-center" onSubmit={handleSubmit(onSubmit)}>
      <TypographyH3>Which emails should stay in your inbox?</TypographyH3>

      <div className="mt-4 grid gap-4">
        <Toggle
          enabled={skipStates.skipReply}
          labelRight="Emails needing replies"
          name="reply"
          onChange={(value) => setSkipStates({ skipReply: value })}
        />
        <Toggle
          enabled={skipStates.skipStarred}
          labelRight="Starred emails"
          name="starred"
          onChange={(value) => setSkipStates({ skipStarred: value })}
        />
        <Toggle
          enabled={skipStates.skipCalendar}
          labelRight="Future events"
          name="calendar"
          onChange={(value) => setSkipStates({ skipCalendar: value })}
        />
        <Toggle
          enabled={skipStates.skipReceipt}
          labelRight="Payment receipts"
          name="receipt"
          onChange={(value) => setSkipStates({ skipReceipt: value })}
        />
        {/* <Toggle
          name="attachment"
          enabled={skipStates.skipAttachment}
          onChange={(value) => setSkipStates({ skipAttachment: value })}
          labelRight="Emails with attachments"
        /> */}
        <Toggle
          enabled={skipStates.skipConversation}
          labelRight="Conversations"
          name="conversation"
          onChange={(value) => setSkipStates({ skipConversation: value })}
          tooltipText="Email threads where you sent a reply"
        />
        <Toggle
          enabled={showCustom}
          labelRight="Custom"
          name="custom"
          onChange={(value) => setShowCustom(value)}
        />
      </div>

      {showCustom && (
        <div className="mt-4">
          <Input
            autosizeTextarea
            error={errors.instructions}
            name="instructions"
            placeholder={`Example:

I work as a freelance designer. Don't archive emails from clients.
I'm in the middle of a building project, keep those emails too.`}
            registerProps={register("instructions")}
            rows={3}
            type="text"
          />
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
}
