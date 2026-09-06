import { Console, Effect } from "effect";
import { Prompt } from "effect/unstable/cli";
import pc from "picocolors";

import type { FontFace } from "@/fonts/names";
import type { FaceChange, PlannedFace } from "@/fonts/plan";
import { ui } from "@/ui";

const CHANGE_LABEL = {
  added: "added",
  replaced: "replaced",
  removed: "removed",
  unchanged: "unchanged",
} as const satisfies Record<FaceChange, string>;

function changeColor(change: FaceChange, label: string): string {
  if (change === "added") {
    return pc.green(label);
  }
  if (change === "replaced") {
    return pc.yellow(label);
  }
  if (change === "removed") {
    return pc.red(label);
  }
  return pc.dim(label);
}

export function printFaceTable(faces: ReadonlyArray<PlannedFace>): Effect.Effect<void> {
  return Effect.gen(function* () {
    if (faces.length === 0) {
      yield* Console.log(ui.muted("No private font faces."));
      return;
    }
    yield* Console.log(
      `${ui.heading("CHANGE".padEnd(11))} ${ui.heading("FAMILY".padEnd(24))} ${ui.heading("STYLE".padEnd(18))} ${ui.heading("POSTSCRIPT".padEnd(28))} ${ui.heading("PATH")}`,
    );
    for (const face of faces) {
      yield* Console.log(
        `${changeColor(face.change, CHANGE_LABEL[face.change].padEnd(11))} ${face.family.padEnd(24)} ${face.style.padEnd(18)} ${face.postscriptName.padEnd(28)} ${face.path}`,
      );
    }
  });
}

export function printInventoryFaces(faces: ReadonlyArray<FontFace>): Effect.Effect<void> {
  return printFaceTable(faces.map((face) => ({ ...face, change: "unchanged" })));
}

export function confirmPlan(
  yes: boolean,
  message: string,
): Effect.Effect<boolean, never, Prompt.Environment> {
  if (yes) {
    return Effect.succeed(true);
  }
  return Prompt.confirm({ message, initial: false }).pipe(Effect.orDie);
}
