import Image from "next/image";
import { userCount } from "@/utils/config";
export function LogoCloud() {
  return (
    <div className="mx-auto mt-16 max-w-7xl px-6 lg:px-8">
      <h2 className="text-center font-title text-gray-900 text-lg leading-8">
        Trusted by {userCount} productive users
      </h2>

      <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 items-center gap-x-8 gap-y-12 sm:max-w-xl sm:grid-cols-3 sm:gap-x-10 sm:gap-y-14 lg:mx-0 lg:max-w-none lg:grid-cols-6">
        <Image
          alt="Resend"
          className="order-4 max-h-12 w-full object-contain lg:order-none"
          height={48}
          src="/images/logos/resend.svg"
          width={158}
        />
        <Image
          alt="ByteDance"
          className="order-3 max-h-12 w-full object-contain lg:order-none"
          height={48}
          src="/images/logos/bytedance.svg"
          width={158}
        />
        <Image
          alt="Netflix"
          className="order-1 max-h-12 w-full object-contain lg:order-none"
          height={48}
          src="/images/logos/netflix.svg"
          width={178}
        />
        <Image
          alt="DOAC"
          className="order-5 max-h-12 w-full object-contain lg:order-none"
          height={48}
          src="/images/logos/doac.svg"
          width={158}
        />
        <Image
          alt="JOCO"
          className="order-6 max-h-12 w-full object-contain lg:order-none"
          height={48}
          src="/images/logos/joco.svg"
          width={158}
        />
      </div>
    </div>
  );
}
