import React from "react";
import "./style.css";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Container, Row, Col, Table } from "react-bootstrap";

export const HamHubPrivacy = () => {
  return (
    <HelmetProvider>
      <Container className="privacy-header">
        <Helmet>
          <meta charSet="utf-8" />
          <title>HamHub Privacy Policy | mabus.ai</title>
          <meta name="description" content="Privacy Policy for HamHub amateur radio logging application" />
        </Helmet>
        <Row className="mb-5 mt-3 pt-md-3">
          <Col lg="10">
            <h1 className="display-4 mb-4 glitch" data-text="HamHub Privacy Policy">HamHub Privacy Policy</h1>
            <hr className="t_border my-4 ml-0 text-left" />
            <p className="text-muted">Last Updated: January 17, 2025</p>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Overview</h3>
            <p>
              HamHub is an amateur radio logging and tools application. We are committed to protecting your privacy.
              This privacy policy explains what information we collect, how we use it, and your rights regarding your data.
            </p>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Information We Collect</h3>

            <h5 className="mt-4">Data Stored Locally</h5>
            <p>HamHub stores all user data locally on your device. This includes:</p>
            <ul className="privacy-list">
              <li><strong>QSO (Contact) Logs:</strong> Information about your amateur radio contacts including callsigns, frequencies, modes, dates, times, signal reports, and notes.</li>
              <li><strong>Settings:</strong> Your preferences such as your callsign, grid square, default power, and theme preferences.</li>
              <li><strong>Awards Tracking:</strong> Progress towards amateur radio awards like DXCC, WAS, and grid squares worked.</li>
            </ul>
            <p className="highlight-box">
              <strong>This data never leaves your device</strong> unless you explicitly export it using the ADIF export feature.
            </p>

            <h5 className="mt-4">Data from External Services</h5>
            <p>HamHub connects to the following external services to provide real-time information:</p>
            <Table className="privacy-table" bordered hover variant="dark">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Data Retrieved</th>
                  <th>Data Sent</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Callook.info</td>
                  <td>Callsign license information</td>
                  <td>Callsign query</td>
                  <td>Callsign lookup feature</td>
                </tr>
                <tr>
                  <td>RepeaterBook.com</td>
                  <td>Repeater database</td>
                  <td>Location/frequency search</td>
                  <td>Repeater search feature</td>
                </tr>
                <tr>
                  <td>HamQSL.com</td>
                  <td>Solar/propagation data</td>
                  <td>None</td>
                  <td>Propagation conditions display</td>
                </tr>
                <tr>
                  <td>N2YO.com</td>
                  <td>ISS position and passes</td>
                  <td>Observer coordinates, API key</td>
                  <td>ISS tracker feature</td>
                </tr>
                <tr>
                  <td>ARRL.org</td>
                  <td>News RSS feed</td>
                  <td>None</td>
                  <td>Amateur radio news</td>
                </tr>
                <tr>
                  <td>Contest Calendar</td>
                  <td>Contest schedule</td>
                  <td>None</td>
                  <td>Upcoming contests list</td>
                </tr>
              </tbody>
            </Table>
            <p>
              <strong>We do not send any of your personal data to these services.</strong> Only search queries
              (like callsigns or locations you're looking up) are transmitted. The N2YO service requires a
              user-provided API key which you obtain directly from n2yo.com.
            </p>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Information We Do NOT Collect</h3>
            <ul className="privacy-list">
              <li>We do not collect personal identification information</li>
              <li>We do not track your location</li>
              <li>We do not use analytics or tracking services</li>
              <li>We do not display advertisements</li>
              <li>We do not share any data with third parties</li>
              <li>We do not have user accounts or authentication</li>
            </ul>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Data Storage and Security</h3>
            <ul className="privacy-list">
              <li>All data is stored locally on your device using Android's Room database</li>
              <li>Data is stored in a SQLite database in the app's private storage directory</li>
              <li>You can export your data at any time using ADIF format</li>
              <li>You can delete all data through the Settings screen</li>
            </ul>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Your Rights</h3>
            <p>You have complete control over your data:</p>
            <ul className="privacy-list">
              <li><strong>Access:</strong> All your data is visible within the app</li>
              <li><strong>Export:</strong> Use the ADIF export feature to backup or transfer your data</li>
              <li><strong>Delete:</strong> Clear all data through Settings &gt; Data Management</li>
              <li><strong>No Account Required:</strong> Use the app without creating any account</li>
            </ul>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Children's Privacy</h3>
            <p>
              HamHub does not knowingly collect information from children under 13.
              The app is designed for licensed amateur radio operators.
            </p>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Changes to This Policy</h3>
            <p>
              We may update this privacy policy from time to time. We will notify users of any significant
              changes through the app or our GitHub repository.
            </p>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Open Source</h3>
            <p>
              HamHub is open source software licensed under CC BY-NC-SA 4.0. You can review the complete
              source code on our <a href="https://github.com/dpdanpittman/HamHub-app" target="_blank" rel="noopener noreferrer">GitHub repository</a>.
            </p>
          </Col>
        </Row>

        <Row className="sec_sp">
          <Col lg="10">
            <h3 className="color_sec py-3">Contact</h3>
            <p>
              For privacy-related questions or concerns, please open an issue on our{" "}
              <a href="https://github.com/dpdanpittman/HamHub-app/issues" target="_blank" rel="noopener noreferrer">GitHub repository</a>.
            </p>
          </Col>
        </Row>

        <Row className="sec_sp mb-5">
          <Col lg="10">
            <h3 className="color_sec py-3">Summary</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <strong>Local Only</strong>
                <span>Your data stays on your device</span>
              </div>
              <div className="summary-item">
                <strong>No Tracking</strong>
                <span>We don't track you or collect analytics</span>
              </div>
              <div className="summary-item">
                <strong>No Ads</strong>
                <span>The app is ad-free</span>
              </div>
              <div className="summary-item">
                <strong>You're in Control</strong>
                <span>Export or delete your data anytime</span>
              </div>
              <div className="summary-item">
                <strong>Open Source</strong>
                <span>Review our code yourself</span>
              </div>
            </div>
          </Col>
        </Row>
      </Container>
    </HelmetProvider>
  );
};
