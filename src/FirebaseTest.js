import React, { useState } from 'react';
import { addData, getData } from './firebase';

export default function FirebaseTest() {
  const [status, setStatus] = useState('');
  const [users, setUsers] = useState([]);

  // Add a test user
  const handleAdd = async () => {
    setStatus('Adding...');
    try {
      const docId = await addData('users', {
        name: 'Test User',
        createdAt: new Date().toISOString(),
      });
      setStatus(`✅ Added user with ID: ${docId}`);
    } catch (e) {
      setStatus('❌ Error adding user: ' + e.message);
    }
  };

  // Fetch all users
  const handleFetch = async () => {
    setStatus('Fetching...');
    try {
      const data = await getData('users');
      setUsers(data);
      setStatus(`✅ Fetched ${data.length} users`);
    } catch (e) {
      setStatus('❌ Error fetching users: ' + e.message);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Firebase Connection Test</h2>
      <button onClick={handleAdd}>Add Test User</button>
      <button onClick={handleFetch} style={{ marginLeft: 8 }}>Fetch Users</button>
      <div style={{ marginTop: 16 }}>{status}</div>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name} <small>({user.createdAt})</small></li>
        ))}
      </ul>
    </div>
  );
}