import GoogleConnect from './GoogleConnect.jsx';

// The "Connect" page: link your Google Sheet. The form is already open.
export default function ConnectPage({ onConnected, onUnauthorized, onOpenProfile }) {
  return (
    <div className="settings">
      <GoogleConnect
        title="Connect your Google Sheet"
        intro="Your members, monthly records and history are stored in your Google Sheet. Connect it to get started."
        startOpen
        onChange={onConnected}
        onUnauthorized={onUnauthorized}
      />
      <p className="muted small-text connect-note">
        Need help? Open your <button type="button" className="link" onClick={onOpenProfile}>Profile</button> page,
        or see <b>Storing members in Google Sheets</b> in the README for how to create the service account.
      </p>
    </div>
  );
}
