const standardPages = [
  { name: 'Home', route: '/home', title: 'RoadTrip' },
  { name: 'Account', route: '/account', title: 'Account', backHref: '/home' },
  { name: 'Ride History', route: '/ride-history', title: 'Ride History', backHref: '/home' },
  { name: 'Lobby', route: '/ride-lobby/header-audit-crew', title: 'Lobby' },
  { name: 'Summary', route: '/ride-history-stats/demo1', title: 'Ride summary', backHref: '/ride-history' },
  { name: 'Share Image', route: '/ride-history-stats/demo1/share', title: 'Create Share Image', backHref: '/ride-history-stats/demo1' },
  { name: 'Replay', route: '/ride-replay/header-audit-missing', title: 'Replay', backHref: '/ride-history-stats/header-audit-missing' },
];

const viewports = [
  { name: 'phone', width: 360, height: 640 },
  { name: 'desktop', width: 1280, height: 800 },
];

const visitLight = (route: string) => cy.visit(route, {
  onBeforeLoad(win) {
    win.localStorage.setItem('roadtrip:theme-preference', 'light');
  },
});

const assertHeaderGeometry = (viewportName: string, viewportWidth: number) => {
  cy.get('ion-header.rt-app-header').should('be.visible').then(($header) => {
    const header = $header[0];
    const headerRect = header.getBoundingClientRect();
    const title = header.querySelector('ion-title');
    expect(title, 'header title exists').not.to.equal(null);
    expect(header.querySelector('.rt-app-header__mark'), 'the compass accent is removed').to.equal(null);

    const titleRect = title!.getBoundingClientRect();
    const titleStyle = window.getComputedStyle(title!);
    const headerStyle = window.getComputedStyle(header);
    const headerAfterStyle = window.getComputedStyle(header, '::after');
    const toolbar = header.querySelector('.rt-app-header__toolbar')!;
    const toolbarStyle = window.getComputedStyle(toolbar);
    expect(headerRect.width, `${viewportName}: header has width`).to.be.greaterThan(0);
    expect(headerRect.left, `${viewportName}: header starts in viewport`).to.be.at.least(0);
    expect(headerRect.right, `${viewportName}: header ends in viewport`).to.be.at.most(viewportWidth);
    expect(titleRect.width, `${viewportName}: title has width`).to.be.greaterThan(0);
    expect(titleRect.left, `${viewportName}: title starts in viewport`).to.be.at.least(0);
    expect(titleRect.right, `${viewportName}: title ends in viewport`).to.be.at.most(viewportWidth);
    expect(titleRect.top, `${viewportName}: title fits inside header`).to.be.at.least(headerRect.top - 1);
    expect(titleRect.bottom, `${viewportName}: title fits inside header`).to.be.at.most(headerRect.bottom + 1);
    expect(parseFloat(titleStyle.fontSize), `${viewportName}: header title keeps its visual hierarchy`).to.be.at.least(16);
    expect(parseInt(titleStyle.fontWeight, 10), `${viewportName}: header title uses a strong weight`).to.be.at.least(700);
    expect(header.classList.contains('ion-no-border'), `${viewportName}: Ionic header opts out of its platform separator`).to.equal(true);
    expect(headerStyle.boxShadow, `${viewportName}: header has no floating shadow`).to.equal('none');
    expect(headerStyle.borderBottomWidth, `${viewportName}: header has no bottom border`).to.equal('0px');
    expect(headerAfterStyle.display, `${viewportName}: Ionic separator pseudo-element is hidden`).to.equal('none');
    expect(toolbarStyle.boxShadow, `${viewportName}: toolbar has no shadow`).to.equal('none');
    expect(toolbarStyle.borderBottomWidth, `${viewportName}: toolbar has no bottom border`).to.equal('0px');
    const backButton = header.querySelector('ion-back-button');
    if (backButton) {
      expect(Math.abs((titleRect.left + titleRect.right) / 2 - (headerRect.left + headerRect.right) / 2), `${viewportName}: back-page title is centered`).to.be.at.most(2);
    } else {
      expect(titleRect.left, `${viewportName}: Home brand starts on the left`).to.be.lessThan(viewportWidth / 2);
      const actions = header.querySelector('.rt-app-header__actions');
      if (actions) {
        expect(actions.getBoundingClientRect().left, `${viewportName}: Home profile action sits on the right`).to.be.greaterThan(viewportWidth / 2);
      }
    }

    const controls = Array.from(header.querySelectorAll('ion-back-button, .rt-app-header__actions button'));
    controls.forEach((control) => {
      const rect = control.getBoundingClientRect();
      expect(rect.width, `${viewportName}: ${control.tagName} has width`).to.be.at.least(44);
      expect(rect.height, `${viewportName}: ${control.tagName} has touch height`).to.be.at.least(44);
      expect(rect.left, `${viewportName}: control starts in viewport`).to.be.at.least(0);
      expect(rect.right, `${viewportName}: control ends in viewport`).to.be.at.most(viewportWidth);
      expect(rect.bottom, `${viewportName}: control fits inside header`).to.be.at.most(headerRect.bottom + 1);
      expect(rect.top, `${viewportName}: control fits inside header`).to.be.at.least(headerRect.top - 1);
      const overlap = rect.left < titleRect.right && rect.right > titleRect.left;
      expect(overlap, `${viewportName}: header control does not overlap title`).to.equal(false);
    });
  });
};

describe('shared standard page header', () => {
  beforeEach(() => {
    cy.intercept('GET', '**.tile.openstreetmap.org/**', { statusCode: 204, body: '' });
    cy.intercept('GET', '**.basemaps.cartocdn.com/**', { statusCode: 204, body: '' });
    cy.intercept('GET', '**.arcgisonline.com/**', { statusCode: 204, body: '' });
  });

  standardPages.forEach((page) => {
    it(`renders ${page.name} consistently at phone and desktop sizes`, () => {
      viewports.forEach((viewport) => {
        cy.viewport(viewport.width, viewport.height);
        visitLight(page.route);
        cy.get('html').should('have.attr', 'data-theme', 'light');
        cy.get('ion-header.rt-app-header ion-title').should('contain.text', page.title);
        if (page.backHref) {
          cy.get('ion-header.rt-app-header ion-back-button')
            .should('be.visible')
            .and('have.attr', 'default-href', page.backHref);
        }
        assertHeaderGeometry(viewport.name, viewport.width);
        if (page.name === 'Account' && page.backHref) {
          cy.get('ion-header.rt-app-header ion-back-button').click();
          cy.location('pathname').should('eq', page.backHref);
        }
      });
    });
  });

  it('keeps Home account navigation and the Plan a ride modal header', () => {
    viewports.forEach((viewport) => {
      cy.viewport(viewport.width, viewport.height);
      visitLight('/home');
      cy.get('ion-header.rt-app-header ion-title').should('contain.text', 'RoadTrip');
      assertHeaderGeometry(viewport.name, viewport.width);
      cy.get('.home-account-btn').should('be.visible').click();
      cy.location('pathname').should('eq', '/account');
      cy.get('ion-header.rt-app-header ion-title').should('contain.text', 'Account');

      visitLight('/home');
      cy.contains('button', 'Start a ride').click();
      cy.get('.ride-setup-modal .rt-app-header ion-title').should('contain.text', 'Plan a ride');
      cy.get('.ride-setup-modal .rt-app-header').should('be.visible');
      cy.get('.ride-setup-modal .rt-app-header').then(($header) => {
        const headerRect = $header[0].getBoundingClientRect();
        const titleRect = $header.find('ion-title')[0].getBoundingClientRect();
        expect(headerRect.left, `${viewport.name}: modal header starts in viewport`).to.be.at.least(0);
        expect(headerRect.right, `${viewport.name}: modal header ends in viewport`).to.be.at.most(viewport.width);
        expect(titleRect.right, `${viewport.name}: modal title ends in viewport`).to.be.at.most(viewport.width);
      });
      cy.get('body').type('{esc}', { force: true });
    });
  });
});
