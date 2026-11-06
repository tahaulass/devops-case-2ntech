// End-to-end test of the main user flows: home page, create, list, edit, delete.
// Uses a unique name per run so it never depends on (or deletes) other data.
describe("MERN application main flows", () => {
  const name = `E2E-${Date.now()}`;

  it("home page shows API status", () => {
    cy.visit("/");
    cy.contains("Create Record").should("exist");
    cy.contains("API Status").should("exist");
    cy.contains('"message":"OK"').should("exist");
  });

  it("creates a record and lists it", () => {
    cy.visit("/create");
    cy.get("#name").type(name);
    cy.get("#position").type("Position1");
    cy.get("#positionIntern").click({ force: true });
    // Target the submit button itself (text-based selectors can match headings too).
    cy.get('input[type="submit"][value="Create person"]').click();
    cy.location("pathname").should("eq", "/records");
    cy.contains("td", name).should("exist");
  });

  it("edits the record", () => {
    cy.visit("/records");
    cy.contains("tr", name).contains("Edit").click();
    cy.get("#position").clear().type("Position2");
    cy.get("#positionSenior").click({ force: true });
    // "Update Record" is also the page heading (<h3>), so select the submit button explicitly.
    cy.get('input[type="submit"][value="Update Record"]').click();
    cy.location("pathname").should("eq", "/records");
    cy.contains("tr", name).should("contain", "Position2").and("contain", "Senior");
  });

  it("deletes the record", () => {
    cy.visit("/records");
    cy.contains("tr", name).contains("Delete").click();
    cy.contains("td", name).should("not.exist");
  });
});
