import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';

import Button from '../ui/Button';
import { describeLocation, formatAddress } from '../utils/location';

const defaultRegion = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function LocationPickerModal({ visible, initialLocation, onSelect, onClose }) {
  const [selected, setSelected] = useState(initialLocation);
  const [selectedAddress, setSelectedAddress] = useState(initialLocation?.address || '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelected(initialLocation || null);
    setSelectedAddress(initialLocation?.address || '');
    setQuery('');
    setResults([]);
    setError('');
  }, [initialLocation, visible]);

  const region = selected
    ? {
        latitude: selected.latitude,
        longitude: selected.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : defaultRegion;

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed.length) {
      setError('Enter an address to search.');
      setResults([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const geocoded = await Location.geocodeAsync(trimmed);
      const normalized = geocoded.map((item, index) => ({
        id: `${item.latitude}-${item.longitude}-${index}`,
        latitude: item.latitude,
        longitude: item.longitude,
        address: formatAddress(item) || trimmed,
      }));
      setResults(normalized);
      if (normalized.length) {
        setSelected({ latitude: normalized[0].latitude, longitude: normalized[0].longitude });
        setSelectedAddress(normalized[0].address);
      } else {
        setSelected(null);
        setSelectedAddress('');
        setError('No matches found. Try another search.');
      }
    } catch (err) {
      console.warn('Failed to geocode query', err);
      setResults([]);
      setError('Unable to find that address. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleResultPress = (item) => {
    setSelected({ latitude: item.latitude, longitude: item.longitude });
    setSelectedAddress(item.address);
  };

  const handleMapPress = async (coordinate) => {
    setSelected(coordinate);
    try {
      const reverse = await Location.reverseGeocodeAsync(coordinate);
      if (reverse?.length) {
        setSelectedAddress(formatAddress(reverse[0]));
      } else {
        setSelectedAddress('');
      }
    } catch (err) {
      console.warn('Failed to reverse geocode pressed coordinate', err);
      setSelectedAddress('');
    }
  };

  const handleSelect = () => {
    if (!selected) {
      setError('Please pick a location before continuing.');
      return;
    }
    onSelect({ ...selected, address: selectedAddress });
    onClose();
  };

  const renderResult = ({ item }) => {
    const isSelected =
      selected &&
      selected.latitude === item.latitude &&
      selected.longitude === item.longitude;
    return (
      <TouchableOpacity
        onPress={() => handleResultPress(item)}
        style={[styles.resultItem, isSelected && styles.resultItemSelected]}
      >
        <Text style={[styles.resultText, isSelected && styles.resultTextSelected]}>{item.address}</Text>
        <Text style={styles.resultMeta}>
          {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.searchSection}>
          <Text style={styles.heading}>Find an address</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by address, city, or ZIP"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <Button title="Search" onPress={handleSearch} style={{ marginTop: 8 }} />
          {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {selected && (
            <View style={styles.selectedSummary}>
              <Text style={styles.selectedLabel}>Selected</Text>
              <Text style={styles.selectedValue} numberOfLines={2}>
                {describeLocation({ ...selected, address: selectedAddress })}
              </Text>
            </View>
          )}
        </View>
        {Platform.OS !== 'web' && (
          <View style={{ height: 220 }}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={region}
              region={region}
              onPress={(e) => handleMapPress(e.nativeEvent.coordinate)}
            >
              {selected && <Marker coordinate={selected} />}
            </MapView>
          </View>
        )}
        <View style={styles.resultsSection}>
          <Text style={styles.resultsHeading}>Results</Text>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderResult}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              !loading && (
                <Text style={styles.emptyText}>
                  Start typing an address to see suggestions.
                </Text>
              )
            }
          />
        </View>
        <View style={styles.footer}>
          <Button title="Cancel" onPress={onClose} style={{ flex: 1, marginRight: 8 }} />
          <Button title="Use Location" onPress={handleSelect} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  errorText: {
    color: '#DC2626',
    marginTop: 8,
  },
  selectedSummary: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F9FAFB',
  },
  selectedLabel: {
    fontWeight: '600',
    marginBottom: 4,
  },
  selectedValue: {
    color: '#111827',
  },
  resultsSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  resultsHeading: {
    fontWeight: '600',
    marginBottom: 8,
  },
  resultItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  resultItemSelected: {
    borderColor: '#16A34A',
    backgroundColor: '#ECFDF5',
  },
  resultText: {
    color: '#111827',
    fontWeight: '600',
    marginBottom: 4,
  },
  resultTextSelected: {
    color: '#166534',
  },
  resultMeta: {
    color: '#6B7280',
    fontSize: 12,
  },
  emptyText: {
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 16,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
});
