import type { PlannedOperation, PlanResult } from "./domain.js";

export function describeOperation(operation: PlannedOperation): string {
  switch (operation.kind) {
    case "createCategory":
      return `Crear categoria "${operation.name}" en posicion ${operation.position}${operation.private ? " como privada" : ""}.`;
    case "createChannel":
      return `Crear canal ${operation.channelType} "${operation.name}" en "${operation.categoryName}" posicion ${operation.position}.`;
    case "moveChannel":
      return `Mover canal "${operation.channelName}" de "${operation.fromCategoryName ?? "sin categoria"}" a "${operation.toCategoryName}".`;
    case "updateCategoryPrivacy":
      return `Ajustar privacidad de categoria "${operation.categoryName}" para roles administrativos.`;
  }
}

export function printPlan(plan: PlanResult): void {
  if (plan.warnings.length > 0) {
    console.log("Advertencias:");
    for (const warning of plan.warnings) {
      console.log(`- ${warning}`);
    }
    console.log("");
  }

  if (plan.operations.length === 0) {
    console.log("No hay operaciones pendientes.");
    return;
  }

  console.log("Operaciones planificadas:");
  plan.operations.forEach((operation, index) => {
    console.log(`${index + 1}. ${describeOperation(operation)}`);
  });
}
