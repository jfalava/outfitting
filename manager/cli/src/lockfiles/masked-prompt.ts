type TerminalEscapeState = "normal" | "escape" | "csi";

function consumeTerminalEscape(
  character: string,
  state: TerminalEscapeState,
): TerminalEscapeState | undefined {
  if (state === "escape") {
    return character === "[" ? "csi" : "normal";
  }
  if (state === "csi") {
    return character >= "@" && character <= "~" ? "normal" : "csi";
  }
  return character === "\u001b" ? "escape" : undefined;
}

export async function maskedPrompt(message: string): Promise<string | null> {
  const input = process.stdin;
  const output = process.stderr;

  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("API token entry requires an interactive terminal.");
  }

  output.write(message);
  input.setEncoding("utf8");
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    let escapeState: TerminalEscapeState = "normal";

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };

    const finish = (result: string | null) => {
      cleanup();
      resolve(result);
    };

    const onData = (chunk: string) => {
      for (const character of chunk) {
        const nextEscapeState = consumeTerminalEscape(character, escapeState);
        if (nextEscapeState) {
          escapeState = nextEscapeState;
          continue;
        }

        if (character === "\r" || character === "\n") {
          finish(value);
          return;
        }

        if (character === "\u0003") {
          cleanup();
          reject(new Error("API token entry cancelled."));
          return;
        }

        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = Array.from(value).slice(0, -1).join("");
            output.write("\b \b");
          }
          continue;
        }

        if (character >= " " && character !== "\u007f") {
          value += character;
          output.write("*");
        }
      }
    };

    input.on("data", onData);
  });
}
