import React, { useState, useEffect } from 'react';
import { Modal, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Button from '../ui/Button';

export default function LocationPickerModal({ visible, initialLocation, onSelect, onClose }) {
  const [selected, setSelected] = useState(initialLocation);

  useEffect(() => {
    setSelected(initialLocation);
  }, [initialLocation, visible]);

  const initialRegion = initialLocation
    ? { ...initialLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };

  const handleSelect = () => {
    onSelect(selected);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        onPress={(e) => setSelected(e.nativeEvent.coordinate)}
      >
        {selected && <Marker coordinate={selected} />}
      </MapView>
      <View
        style={{
          position: 'absolute',
          bottom: 20,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'space-around',
        }}
      >
        <Button title="Cancel" onPress={onClose} style={{ flex: 1, marginHorizontal: 10 }} />
        <Button title="Select" onPress={handleSelect} style={{ flex: 1, marginHorizontal: 10 }} />
      </View>
    </Modal>
  );
}
