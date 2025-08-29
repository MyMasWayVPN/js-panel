import React, { useState } from 'react';
import ContainerGrid from './components/ContainerGrid.jsx';
import ContainerDetail from './components/ContainerDetail.jsx';
import Login from './components/Login.jsx';

export default function App(){
  const [authed, setAuthed] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState(null);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  if (selectedContainer) {
    return (
      <ContainerDetail 
        container={selectedContainer}
        onBack={() => setSelectedContainer(null)}
      />
    );
  }

  return (
    <ContainerGrid 
      onSelectContainer={setSelectedContainer}
      onLogout={() => setAuthed(false)}
    />
  );
}
