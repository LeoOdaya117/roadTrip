const pages = [
  { name: 'Home and setup entry', route: '/home', heading: '.crew-create-card .card-label', headingText: 'Plan a ride', primary: '.crew-create-card button' },
  { name: 'Ride lobby', route: '/ride-lobby/visual-audit-crew', heading: '.page-hero h1', headingText: 'Your crew', primary: '.lobby-copy-code' },
  { name: 'Live map', route: '/ride-map/solo-visual-audit', heading: '.live-badge', headingText: 'Live', primary: '[aria-label="Change map style and details"]' },
  { name: 'Account', route: '/account', heading: '.account-intro h1', headingText: 'Your profile', primary: '[aria-label="Change profile photo"]' },
  { name: 'Ride history', route: '/ride-history', heading: '.history-intro h1', headingText: 'Your rides', primary: 'ion-segment-button[value="solo"]' },
  { name: 'Ride summary', route: '/ride-history-stats/demo1', heading: '.summary-heading h1', headingText: 'Ride complete', primary: '.rh-generate-btn' },
  { name: 'Share image', route: '/ride-history-stats/demo1/share', heading: 'ion-title', headingText: 'Create Share Image', primary: 'button.rh-generate-btn' },
  { name: 'Ride replay', route: '/ride-replay/visual-audit-missing', heading: 'ion-title', headingText: 'Replay', primary: '[role="alert"]' },
];

const viewports = [
  { name: 'phone portrait', width: 360, height: 640 },
  { name: 'phone portrait large', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1280, height: 800 },
];

const themes = ['system', 'light', 'dark'] as const;
const selectedPages = Cypress.env('auditPage')
  ? pages.filter((page) => page.name === Cypress.env('auditPage'))
  : pages;

describe('all routed pages: viewport and theme smoke audit', () => {
  beforeEach(() => {
    cy.intercept('GET', '**.tile.openstreetmap.org/**', { statusCode: 204, body: '' });
    cy.intercept('GET', '**.basemaps.cartocdn.com/**', { statusCode: 204, body: '' });
    cy.intercept('GET', '**.arcgisonline.com/**', { statusCode: 204, body: '' });
  });

  selectedPages.forEach((page) => {
    it(`renders ${page.name} without overflow or obscured primary actions`, () => {
      viewports.forEach((viewport) => {
        themes.forEach((theme) => {
          cy.viewport(viewport.width, viewport.height);
          cy.visit(page.route, {
            onBeforeLoad(win) {
              win.localStorage.setItem('roadtrip:theme-preference', theme);
            },
          });
          cy.document().its('documentElement.dataset.themePreference').should('equal', theme);
          cy.document().then((doc) => cy.window().then((win) => {
            const effectiveTheme = theme === 'system'
              ? (win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
              : theme;
            expect(doc.documentElement.dataset.theme, `${page.name} ${theme} effective theme`).to.equal(effectiveTheme);
          }));
          cy.get('ion-app').should('be.visible');
          if (page.name !== 'Live map') {
            cy.get('ion-header.rt-app-header').should('be.visible').then(($header) => {
              const header = $header[0];
              const headerStyle = getComputedStyle(header);
              const headerAfterStyle = getComputedStyle(header, '::after');
              const toolbar = header.querySelector('.rt-app-header__toolbar')!;
              const toolbarStyle = getComputedStyle(toolbar);
              const title = header.querySelector('ion-title')!;
              const titleBounds = title.getBoundingClientRect();
              const headerBounds = header.getBoundingClientRect();
              const backButton = header.querySelector('ion-back-button');
              const controls = Array.from(header.querySelectorAll('ion-back-button, .rt-app-header__actions button'));
              expect(header.classList.contains('ion-no-border'), `${page.name} ${theme} Ionic border opt-out`).to.equal(true);
              expect(headerStyle.boxShadow, `${page.name} ${theme} no header shadow`).to.equal('none');
              expect(headerStyle.borderBottomWidth, `${page.name} ${theme} no header bottom border`).to.equal('0px');
              expect(headerAfterStyle.display, `${page.name} ${theme} hidden Ionic separator`).to.equal('none');
              expect(toolbarStyle.boxShadow, `${page.name} ${theme} no toolbar shadow`).to.equal('none');
              expect(toolbarStyle.borderBottomWidth, `${page.name} ${theme} no toolbar bottom border`).to.equal('0px');
              expect(header.querySelector('.rt-app-header__mark'), `${page.name} compass is removed`).to.equal(null);
              expect(titleBounds.left, `${page.name} ${viewport.name} title starts in viewport`).to.be.at.least(0);
              expect(titleBounds.right, `${page.name} ${viewport.name} title ends in viewport`).to.be.at.most(viewport.width);
              if (backButton) {
                expect(Math.abs((titleBounds.left + titleBounds.right) / 2 - (headerBounds.left + headerBounds.right) / 2), `${page.name} ${viewport.name} ${theme} back-page title is centered`).to.be.at.most(2);
              } else {
                expect(titleBounds.left, `${page.name} ${viewport.name} Home title is left aligned`).to.be.lessThan(viewport.width / 2);
                const actions = header.querySelector('.rt-app-header__actions');
                if (actions) {
                  const actionBounds = actions.getBoundingClientRect();
                  expect(actionBounds.left, `${page.name} ${viewport.name} profile action is on the right`).to.be.greaterThan(viewport.width / 2);
                }
              }
              controls.forEach((control) => {
                const bounds = control.getBoundingClientRect();
                expect(bounds.width, `${page.name} ${viewport.name} control target width`).to.be.at.least(44);
                expect(bounds.height, `${page.name} ${viewport.name} control target height`).to.be.at.least(44);
                expect(bounds.left, `${page.name} ${viewport.name} control starts in viewport`).to.be.at.least(0);
                expect(bounds.right, `${page.name} ${viewport.name} control ends in viewport`).to.be.at.most(viewport.width);
                expect(bounds.bottom, `${page.name} ${viewport.name} control fits inside header`).to.be.at.most(headerBounds.bottom + 1);
                expect(bounds.top, `${page.name} ${viewport.name} control fits inside header`).to.be.at.least(headerBounds.top - 1);
                expect(bounds.left < titleBounds.right && bounds.right > titleBounds.left, `${page.name} ${viewport.name} control does not overlap title`).to.equal(false);
              });
            });
          }
          if (page.name === 'Live map') {
            // The status sits in a deliberately non-interactive overlay (pointer-events: none)
            // above Leaflet, so Cypress's hit-test based visibility check treats the map canvas
            // underneath as a cover even though the label is visibly painted.
            cy.get(page.heading).should('exist').then(($heading) => {
              const bounds = $heading[0].getBoundingClientRect();
              const styles = getComputedStyle($heading[0]);
              expect($heading.text().trim().length, 'live status should contain a status label').to.be.greaterThan(0);
              expect(bounds.width, 'live status should have visible layout').to.be.greaterThan(0);
              expect(bounds.height, 'live status should have visible layout').to.be.greaterThan(0);
              expect(styles.visibility).to.equal('visible');
              expect(Number(styles.opacity)).to.be.greaterThan(0);
            });
          } else {
            cy.contains(page.heading, page.headingText).should('be.visible');
          }
          if (page.name === 'Ride summary') {
            cy.get('.summary-screen .ride-history-page').then(($page) => {
              const pageElement = $page[0] as HTMLElement;
              const pageBounds = pageElement.getBoundingClientRect();
              const pageStyles = getComputedStyle(pageElement);
              const paddingLeft = Number.parseFloat(pageStyles.paddingLeft);
              const paddingRight = Number.parseFloat(pageStyles.paddingRight);
              const headingBounds = pageElement.querySelector('.summary-heading')!.getBoundingClientRect();
              const mapBounds = pageElement.querySelector('.rh-map')!.getBoundingClientRect();
              const cardBounds = pageElement.querySelector('.rh-side .rh-card')!.getBoundingClientRect();
              const cardPadding = Number.parseFloat(getComputedStyle(pageElement.querySelector('.rh-card')!).paddingLeft);

              expect(paddingLeft, `${viewport.name} summary left page padding`).to.be.at.least(12);
              expect(paddingRight, `${viewport.name} summary right page padding`).to.be.at.least(12);
              expect(Math.abs(headingBounds.left - (pageBounds.left + paddingLeft)), `${viewport.name} heading left inset`).to.be.at.most(1);
              expect(Math.abs(mapBounds.left - headingBounds.left), `${viewport.name} map and heading left alignment`).to.be.at.most(1);
              expect(Math.abs(cardBounds.right - (pageBounds.right - paddingRight)), `${viewport.name} card right inset`).to.be.at.most(1);
              expect(cardPadding, `${viewport.name} card internal padding`).to.be.greaterThan(0);
            });
            cy.get('ion-content.summary-screen').then(($content) => {
              const ionContent = $content[0] as HTMLElement & { getScrollElement: () => Promise<HTMLElement> };
              return ionContent.getScrollElement().then((scroller) => {
                expect(scroller.scrollHeight, `share scroll container height=${scroller.clientHeight}`).to.be.greaterThan(scroller.clientHeight);
                scroller.scrollTop = scroller.scrollHeight;
                scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
              });
            });
          }
          if (page.name === 'Ride replay') {
            cy.get('.replay-page-shell').then(($shell) => {
              if ($shell.find('.replay-controls').length > 0) cy.wrap($shell).scrollTo('bottom');
            });
          }
          if (page.name === 'Share image') {
            cy.get('.share-page-scroll').scrollTo('bottom');
          }
          cy.get(page.primary).first().should('exist').scrollIntoView().then(($primary) => {
            const primary = $primary[0].getBoundingClientRect();
            expect(primary.width, `${page.name} primary action should have layout width`).to.be.greaterThan(0);
            expect(primary.height, `${page.name} primary action should have layout height`).to.be.greaterThan(0);
            expect(primary.left, `${page.name} primary action should be in the viewport`).to.be.at.least(0);
            expect(primary.top, `${page.name} primary action should be in the viewport`).to.be.at.least(0);
            expect(primary.right, `${page.name} primary action should be in the viewport`).to.be.at.most(viewport.width);
            expect(primary.bottom, `${page.name} primary action should be in the viewport`).to.be.at.most(viewport.height);
            const disabled = $primary[0].hasAttribute('disabled') || $primary.attr('aria-disabled') === 'true';
            if (!disabled) {
              const topmost = $primary[0].ownerDocument.elementFromPoint(primary.left + primary.width / 2, primary.top + primary.height / 2);
              expect(topmost === $primary[0] || $primary[0].contains(topmost), `${page.name} primary action should pass hit testing`).to.equal(true);
            }
          });
          cy.document().then((doc) => {
            expect(doc.documentElement.scrollWidth, `${page.name} ${viewport.name} ${theme} document overflow`).to.be.at.most(viewport.width);
            expect(doc.body.scrollWidth, `${page.name} ${viewport.name} ${theme} body overflow`).to.be.at.most(viewport.width);
          });
        });
      });
    });
  });
});
