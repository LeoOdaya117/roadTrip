describe('account page actions', () => {
  const visitAccount = () => cy.visit('/account', {
    onBeforeLoad: (win) => {
      win.localStorage.clear();
      win.localStorage.setItem('rt_profile_name', 'Cypress Rider');
      win.localStorage.setItem('roadtrip:theme-preference', 'system');
    },
  });

  it('saves profile edits and avatar upload/removal across reloads', () => {
    visitAccount();

    cy.get('#profile-name').should('have.value', 'Cypress Rider').clear().type('Road Tester');
    cy.get('button.account-save').click();
    cy.window().its('localStorage.rt_profile_name').should('equal', 'Road Tester');

    cy.get('input[aria-label="Choose a profile photo"]').selectFile({
      contents: Cypress.Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#2563eb"/></svg>'),
      fileName: 'avatar.svg',
      mimeType: 'image/svg+xml',
    }, { force: true });
    cy.get('.account-avatar-img', { timeout: 5000 }).should('have.attr', 'src').and('match', /^data:image\/jpeg/);
    cy.get('button.account-save').click();
    cy.window().its('localStorage.rt_profile_avatar').should('match', /^data:image\/jpeg/);

    cy.reload();
    cy.get('#profile-name').should('have.value', 'Road Tester');
    cy.get('.account-avatar-img').should('have.attr', 'src').and('match', /^data:image\/jpeg/);
    cy.contains('button', 'Remove photo').click();
    cy.get('.account-avatar-img').should('not.exist');
    cy.get('button.account-save').click();
    cy.window().then((win) => expect(win.localStorage.getItem('rt_profile_avatar')).to.be.null);

    cy.reload();
    cy.get('#profile-name').should('have.value', 'Road Tester');
    cy.get('.account-avatar-img').should('not.exist');
    cy.get('button[aria-label="Change profile photo"]').should('be.visible');
  });

  it('updates the effective appearance and persists each theme selection', () => {
    visitAccount();

    cy.contains('button.theme-choice-option', 'Light').click();
    cy.get('html').should('have.attr', 'data-theme', 'light').and('have.attr', 'data-theme-preference', 'light');
    cy.window().its('localStorage.roadtrip:theme-preference').should('equal', 'light');

    cy.contains('button.theme-choice-option', 'Dark').click();
    cy.get('html').should('have.attr', 'data-theme', 'dark').and('have.attr', 'data-theme-preference', 'dark');
    cy.window().its('localStorage.roadtrip:theme-preference').should('equal', 'dark');

    cy.contains('button.theme-choice-option', 'System').click();
    cy.get('html').should('have.attr', 'data-theme-preference', 'system');
    cy.window().its('localStorage.roadtrip:theme-preference').should('equal', 'system');
    cy.reload();
    cy.get('html').should('have.attr', 'data-theme-preference', 'system');
    cy.contains('button.theme-choice-option', 'System').should('have.attr', 'aria-pressed', 'true');
  });

  it('shows a recoverable message when profile storage rejects the save', () => {
    visitAccount();
    cy.get('#profile-name').should('have.value', 'Cypress Rider').clear().type('Unsaved Rider');
    cy.window().then((win) => {
      const originalSetItem = win.Storage.prototype.setItem;
      cy.stub(win.Storage.prototype, 'setItem').callsFake(function (key: string, value: string) {
        if (key === 'rt_profile_name') throw new win.DOMException('Storage is full', 'QuotaExceededError');
        return originalSetItem.call(this, key, value);
      });
    });

    cy.get('button.account-save').click();
    cy.get('[role="alert"]').should('be.visible').and('contain.text', 'Failed to save profile');
    cy.window().its('localStorage.rt_profile_name').should('equal', 'Cypress Rider');
  });
});
