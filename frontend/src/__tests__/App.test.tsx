import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

const TARGET_TEXT = "hello world here";

function buildHighlightPayload(url: string) {
  const parsed = new URL(url);
  const params = parsed.searchParams;
  const indexBase = Number(params.get("index_base") ?? "0") as 0 | 1;
  const mode = (params.get("mode") ?? "end") as "end" | "length";
  const startUser = Number(params.get("start") ?? "0");
  const radius = Number(params.get("radius") ?? "10");
  const start0 = startUser - indexBase;
  const end0 =
    mode === "end"
      ? Number(params.get("end") ?? "0") - indexBase
      : start0 + Number(params.get("length") ?? "0");
  const safeStart0 = Math.max(0, Math.min(start0, TARGET_TEXT.length));
  const safeEnd0 = Math.max(safeStart0, Math.min(end0, TARGET_TEXT.length));

  return {
    file_id: "test-file-id",
    target_line: 2,
    radius,
    total_lines: 3,
    index_base: indexBase,
    mode,
    effective_start: startUser,
    effective_end: safeEnd0 + indexBase,
    effective_length: safeEnd0 - safeStart0,
    normalized: { start0: safeStart0, end0_exclusive: safeEnd0 },
    lines: [
      { line_no: 1, text: "line0" },
      {
        line_no: 2,
        text: TARGET_TEXT,
        line_length: TARGET_TEXT.length,
        segments: {
          pre: TARGET_TEXT.slice(0, safeStart0),
          mid: TARGET_TEXT.slice(safeStart0, safeEnd0),
          post: TARGET_TEXT.slice(safeEnd0),
        },
      },
      { line_no: 3, text: "line2" },
    ],
  };
}

describe("TxtReader App", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/files/") && url.includes("/highlight")) {
        return {
          ok: true,
          json: async () => buildHighlightPayload(url),
        } as Response;
      }

      if (url.endsWith("/api/files")) {
        return {
          ok: true,
          json: async () => ({
            file_id: "test-file-id",
            filename: "sample.txt",
            total_lines: 3,
          }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ detail: "Unknown endpoint" }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("upload then highlight works across indexing/range modes", async () => {
    render(<App />);

    const fileInput = screen.getByLabelText(/Text file/i) as HTMLInputElement;
    const file = new File(["line0\nhello world here\nline2\n"], "sample.txt", { type: "text/plain" });
    await userEvent.upload(fileInput, file);
    await userEvent.click(screen.getByRole("button", { name: /Upload/i }));

    await waitFor(() => {
      expect(screen.getByText(/Total lines:/i)).toBeInTheDocument();
    });

    await userEvent.clear(screen.getByLabelText(/Line #/i));
    await userEvent.type(screen.getByLabelText(/Line #/i), "2");
    await userEvent.clear(screen.getByLabelText(/Start Index/i));
    await userEvent.type(screen.getByLabelText(/Start Index/i), "6");
    await userEvent.clear(screen.getByLabelText(/End Index/i));
    await userEvent.type(screen.getByLabelText(/End Index/i), "11");
    await userEvent.click(screen.getByRole("button", { name: /Go \/ Highlight/i }));

    await waitFor(() => {
      expect(screen.getByText("world")).toBeInTheDocument();
      expect(screen.getByText(/Effective range: \[6, 11\)/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("checkbox", { name: /Show spaces as dots/i }));
    const targetLinePre = document.querySelector(".target-row .line-content");
    expect(targetLinePre?.textContent).toContain("hello.world.here");

    await userEvent.click(screen.getByRole("radio", { name: "1-based" }));
    await userEvent.click(screen.getByRole("radio", { name: /Start \+ Length/i }));
    await userEvent.clear(screen.getByLabelText(/^Start Index/i));
    await userEvent.type(screen.getByLabelText(/^Start Index/i), "7");
    await userEvent.clear(screen.getByLabelText(/^Length$/i));
    await userEvent.type(screen.getByLabelText(/^Length$/i), "5");
    await userEvent.click(screen.getByRole("button", { name: /Go \/ Highlight/i }));

    await waitFor(() => {
      expect(screen.getByText(/Computed end \(1-based exclusive\): 12/i)).toBeInTheDocument();
      expect(screen.getByText(/Effective range: \[7, 12\)/i)).toBeInTheDocument();
    });

    const rulerLabels = document.querySelector(".line-ruler-labels");
    expect(rulerLabels?.textContent?.trimStart().startsWith("1")).toBe(true);

    const highlightCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/highlight"));
    expect(highlightCalls.some((url) => url.includes("index_base=1"))).toBe(true);
    expect(highlightCalls.some((url) => url.includes("mode=length"))).toBe(true);
    expect(highlightCalls.some((url) => url.includes("length=5"))).toBe(true);
  });
});

