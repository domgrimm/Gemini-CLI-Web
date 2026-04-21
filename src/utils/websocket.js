import { useState, useEffect, useRef } from 'react';

export function useWebSocket() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const connect = async () => {
    try {
      // Get authentication token
      const token = localStorage.getItem('auth-token');
      if (!token) {
        // console.warn('No authentication token found for WebSocket connection');
        return;
      }

      // Determine the API and WebSocket base URL
      // If we're on port 4009 (Vite dev), the API is on 4008.
      // Otherwise, the API is on the same port as the UI (production).
      const currentPort = window.location.port;
      const apiPort = currentPort === '4009' ? '4008' : currentPort;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const httpProtocol = window.location.protocol;
      const host = window.location.hostname;
      
      const apiBaseUrl = `${httpProtocol}//${host}${apiPort ? `:${apiPort}` : ''}`;
      const wsBaseUrl = `${protocol}//${host}${apiPort ? `:${apiPort}` : ''}`;

      // Fetch server configuration to get the correct WebSocket URL
      let finalWsBaseUrl = wsBaseUrl;
      try {
        const configResponse = await fetch(`${apiBaseUrl}/api/config`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (configResponse.ok) {
          const config = await configResponse.json();
          // Use the wsUrl from config if available, otherwise use our calculated one
          if (config.wsUrl) {
            finalWsBaseUrl = config.wsUrl;
          }
        }
      } catch (error) {
        // console.warn('Config fetch failed, using fallback URL');
      }

      // Include token in WebSocket URL as query parameter
      const wsUrl = `${finalWsBaseUrl}/ws?token=${encodeURIComponent(token)}`;
      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setIsConnected(true);
        setWs(websocket);
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages(prev => [...prev, data]);
        } catch (error) {
          // console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        setIsConnected(false);
        setWs(null);

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      websocket.onerror = (error) => {
        // console.error('WebSocket error:', error);
      };

    } catch (error) {
      // console.error('Error creating WebSocket connection:', error);
    }
  };

  const sendMessage = (message) => {
    if (ws && isConnected) {
      ws.send(JSON.stringify(message));
    } else {
      // console.warn('WebSocket not connected');
    }
  };

  return {
    ws,
    sendMessage,
    messages,
    isConnected
  };
}