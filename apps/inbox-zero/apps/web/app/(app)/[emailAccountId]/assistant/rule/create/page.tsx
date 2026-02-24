import { RuleForm } from "@/app/(app)/[emailAccountId]/assistant/RuleForm";
import { ActionType } from "@/generated/prisma/enums";
import { getEmptyCondition } from "@/utils/condition";
import type { CoreConditionType } from "@/utils/config";

export default async function CreateRulePage(props: {
  searchParams: Promise<{
    groupId?: string;
    type?: CoreConditionType;
    label?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  return (
    <div className="content-container">
      <RuleForm
        alwaysEditMode
        rule={{
          name: searchParams.label ? `Label ${searchParams.label}` : "",
          actions: searchParams.label
            ? [
                {
                  type: ActionType.LABEL,
                  labelId: { name: searchParams.label },
                },
              ]
            : [],
          conditions: searchParams.type
            ? [getEmptyCondition(searchParams.type)]
            : [],
          runOnThreads: true,
        }}
      />
    </div>
  );
}
