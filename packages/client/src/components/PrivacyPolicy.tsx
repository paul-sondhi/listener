import { Link } from 'react-router-dom'
import './PrivacyPolicy.css'

export default function PrivacyPolicy() {
  return (
    <div className="privacy-policy-container">
      <div className="privacy-policy-content">
        <Link to="/login" className="back-link">← Back to Login</Link>
        
        <h1>Privacy Policy</h1>
        <p className="last-updated">Last Updated: July 23, 2025</p>

        <section>
          <h2>1. Introduction</h2>
          <p>
            Welcome to Listener ("we," "our," or "us"). We are committed to protecting your privacy and 
            ensuring the security of your personal information. This Privacy Policy explains how we collect, 
            use, disclose, and safeguard your information when you use our podcast transcription and 
            newsletter service.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          
          <h3>Information You Provide</h3>
          <ul>
            <li><strong>Spotify Account Information:</strong> When you sign in with Spotify, we collect 
            your Spotify email address, user ID, and display name.</li>
            <li><strong>Email Preferences:</strong> Your newsletter delivery preferences and settings.</li>
          </ul>

          <h3>Information We Collect Automatically</h3>
          <ul>
            <li><strong>Spotify Podcast Subscriptions:</strong> We access and sync your podcast 
            subscriptions from your Spotify account to provide our service.</li>
            <li><strong>Usage Data:</strong> Information about how you interact with our service, 
            including login times and features used.</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Authenticate you via Spotify OAuth</li>
            <li>Sync your podcast subscriptions from Spotify</li>
            <li>Fetch transcripts for podcast episodes you're subscribed to</li>
            <li>Generate AI-powered summaries and insights from episode transcripts</li>
            <li>Create and send personalized daily newsletter emails</li>
            <li>Improve and maintain our service</li>
            <li>Communicate with you about service updates or issues</li>
          </ul>
        </section>

        <section>
          <h2>4. How We Share Your Information</h2>
          <p>We share your information only in the following circumstances:</p>
          
          <h3>Third-Party Service Providers</h3>
          <ul>
            <li><strong>Spotify:</strong> For authentication and accessing your podcast subscriptions. 
            We use Spotify's official OAuth implementation.</li>
            <li><strong>Taddy:</strong> We share podcast episode identifiers (not your personal data) 
            to fetch episode transcripts.</li>
            <li><strong>Google Gemini:</strong> We send episode transcript text (not your personal data) 
            to generate summaries and insights.</li>
            <li><strong>Resend:</strong> We share your email address to deliver newsletter emails.</li>
            <li><strong>Supabase:</strong> Our database and authentication provider where your encrypted 
            data is stored.</li>
          </ul>

          <p>We do not sell, trade, or rent your personal information to third parties.</p>
        </section>

        <section>
          <h2>5. Data Security</h2>
          <p>We implement appropriate technical and organizational measures to protect your personal 
          information, including:</p>
          <ul>
            <li>Encryption of sensitive data (like Spotify tokens) in our database</li>
            <li>Secure HTTPS connections for all data transmission</li>
            <li>Regular security updates and monitoring</li>
            <li>Limited access to personal data on a need-to-know basis</li>
          </ul>
          <p>However, no method of transmission over the internet or electronic storage is 100% secure, 
          and we cannot guarantee absolute security.</p>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>We retain your personal information for as long as necessary to provide our services and 
          fulfill the purposes outlined in this Privacy Policy. Specifically:</p>
          <ul>
            <li>Account information is retained until you delete your account</li>
            <li>Newsletter editions are retained for 30 days</li>
            <li>Transcript notes are retained indefinitely to avoid re-processing</li>
          </ul>
        </section>

        <section>
          <h2>7. Your Rights and Choices</h2>
          <p>You have the following rights regarding your personal information:</p>
          <ul>
            <li><strong>Access:</strong> You can request access to the personal information we hold 
            about you.</li>
            <li><strong>Deletion:</strong> You can delete your account at any time, which will remove 
            your personal information from our systems.</li>
            <li><strong>Opt-out:</strong> You can unsubscribe from newsletters at any time through the 
            unsubscribe link in emails or your account settings.</li>
            <li><strong>Portability:</strong> You can request a copy of your data in a structured, 
            commonly used format.</li>
          </ul>
        </section>

        <section>
          <h2>8. Children's Privacy</h2>
          <p>Our service is not intended for children under 13 years of age. We do not knowingly collect 
          personal information from children under 13. If you are a parent or guardian and believe your 
          child has provided us with personal information, please contact us.</p>
        </section>

        <section>
          <h2>9. Changes to This Privacy Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of any changes by 
          updating the "Last Updated" date at the top of this policy. Continued use of our service after 
          any modifications indicates your acceptance of the updated Privacy Policy.</p>
        </section>

        <section>
          <h2>10. Contact Us</h2>
          <p>If you have any questions, concerns, or requests regarding this Privacy Policy or our 
          privacy practices, please contact us at:</p>
          <p>Email: paulsondhi1@gmail.com</p>
        </section>

        <section>
          <h2>11. California Privacy Rights</h2>
          <p>If you are a California resident, you have additional rights under the California Consumer 
          Privacy Act (CCPA), including the right to opt-out of the sale of your personal information 
          (though we do not sell personal information) and the right to non-discrimination for 
          exercising your privacy rights.</p>
        </section>
      </div>
    </div>
  )
}