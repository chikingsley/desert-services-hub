"use client";

import { useEffect } from "react";
import { Loading } from "@/components/Loading";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { logOut } from "@/utils/user";

export default function LogoutPage() {
  useEffect(() => {
    logOut("/login");
  }, []);

  return (
    <BasicLayout>
      <Loading />
    </BasicLayout>
  );
}
