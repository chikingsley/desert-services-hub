"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Confetti from "react-dom-confetti";
import { Button } from "@/components/Button";
import { getCelebrationImage } from "@/utils/celebration";

export function Celebration(props: { message: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
  }, []);

  return (
    <>
      <div className="flex items-center justify-center font-title text-2xl text-primary">
        Congrats! {props.message}
      </div>
      <div className="flex items-center justify-center">
        <Confetti
          active={active}
          config={{
            duration: 3000,
            elementCount: 500,
            spread: 200,
          }}
        />
      </div>

      <div className="mt-8 flex justify-center">
        <Button
          onClick={() => {
            const tweet = encodeURIComponent(
              "I made it to Inbox Zero thanks to @inboxzero_ai!"
            );
            const twitterIntentURL = `https://x.com/intent/tweet?text=${tweet}`;
            window.open(
              twitterIntentURL,
              "_blank",
              "noopener,noreferrer,width=550,height=420"
            );
          }}
          size="2xl"
        >
          Share on Twitter
        </Button>
      </div>

      <div className="mt-8 flex items-center justify-center">
        <Image
          alt="Congrats!"
          height={400}
          src={getCelebrationImage()}
          unoptimized
          width={400}
        />
      </div>
    </>
  );
}
