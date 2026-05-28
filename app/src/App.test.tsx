import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders PiecePool shell", () => {
  render(<App />);
  expect(screen.getByText("PiecePool")).toBeInTheDocument();
});
