import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

describe("TxtReader App", () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/files/") && url.includes("/highlight")) {
        return {
          ok: true,
          json: async () => ({
            target_line: 2,
            radius: 10,
            total_lines: 3,
            highlight: { start: 6, end: 11 },
            lines: [
              { line_no: 1, text: "line0" },
              {
                line_no: 2,
                text: "hello world",
                segments: { pre: "hello ", mid: "world", post: "" },
              },
              { line_no: 3, text: "line2" },
            ],
          }),
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

  test("upload then highlight works", async () => {
    render(<App />);

    const fileInput = screen.getByLabelText(/Text file/i) as HTMLInputElement;
    const file = new File(["line0\nhello world\nline2\n"], "sample.txt", { type: "text/plain" });
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
    await userEvent.click(screen.getByRole("button", { name: /^Go$/i }));

    await waitFor(() => {
      expect(screen.getByText("world")).toBeInTheDocument();
    });
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

