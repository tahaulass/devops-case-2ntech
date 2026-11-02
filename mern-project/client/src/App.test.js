import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ message: "OK" }) })
  );
});

test("renders navigation and API status page", async () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>
  );
  expect(screen.getByText("Create Record")).toBeInTheDocument();
  expect(await screen.findByText(/"message":"OK"/)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith("/api/healthcheck");
});
