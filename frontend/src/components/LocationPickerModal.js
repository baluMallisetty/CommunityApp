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
import { geocodeAddress } from '../utils/geocoding';
import { describeLocation, formatAddress } from '../utils/location';

const defaultRegion = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const inferCountryFromLocation = (location) => {
  if (!location) return null;
  const name = location.country || null;
  const code = location.countryCode || location.isoCountryCode || null;
  if (name || code) {
    return { name: name || null, code: code ? code.toUpperCase() : null };
  }
  if (typeof location.address === 'string') {
    const parts = location.address
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length) {
      return { name: parts[parts.length - 1], code: null };
    }
  }
  return null;
};

const matchesCountryFilter = (countryFilter, item) => {
  if (!countryFilter) return true;
  const filterCode = countryFilter.code?.toUpperCase();
  const filterName = countryFilter.name?.toLowerCase();
  if (filterCode && item.countryCode) {
    return item.countryCode.toUpperCase() === filterCode;
  }
  if (filterName && item.country) {
    return item.country.toLowerCase() === filterName;
  }
  return true;
};

export default function LocationPickerModal({ visible, initialLocation, onSelect, onClose }) {
  const [selected, setSelected] = useState(initialLocation);
  const [selectedAddress, setSelectedAddress] = useState(initialLocation?.address || '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countryFilter, setCountryFilter] = useState(() => inferCountryFromLocation(initialLocation));
  const [allowAutoCountryFilter, setAllowAutoCountryFilter] = useState(true);
  const [hiddenResultsCount, setHiddenResultsCount] = useState(0);
  const [lastRawResults, setLastRawResults] = useState([]);

  useEffect(() => {
    if (!visible) return;
    setSelected(initialLocation || null);
    setSelectedAddress(initialLocation?.address || '');
    setQuery('');
    setResults([]);
    setError('');
    setHiddenResultsCount(0);
    setLastRawResults([]);
    setAllowAutoCountryFilter(true);
    setCountryFilter(inferCountryFromLocation(initialLocation));
  }, [initialLocation, visible]);

  const region = selected
    ? {
        latitude: selected.latitude,
        longitude: selected.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : defaultRegion;

  const runSearch = useCallback(
    async (
      text,
      { showEmptyError = false, autoSelectFirst = true, showNoResultsError = true } = {}
    ) => {
      const trimmed = text.trim();
      if (!trimmed.length) {
        setResults([]);
        setLoading(false);
        if (showEmptyError) {
          setError('Enter an address to search.');
        } else {
          setError('');
        }
        return;
      }
      setLoading(true);
      setError('');
      try {
        const geocoded = await geocodeAddress(trimmed);
        const normalized = geocoded.map((item, index) => ({
          id: `${item.latitude}-${item.longitude}-${index}`,
          latitude: item.latitude,
          longitude: item.longitude,
          address: formatAddress(item) || trimmed,
        }));
        setResults(normalized);
        if (normalized.length) {
          if (autoSelectFirst) {
            setSelected({ latitude: normalized[0].latitude, longitude: normalized[0].longitude });
            setSelectedAddress(normalized[0].address);
          }
        } else {
          if (showNoResultsError) {
            setSelected(null);
            setSelectedAddress('');
            setError('No matches found. Try another search.');
          } else {
            setError('');
          }
        }
      } catch (err) {
        console.warn('Failed to geocode query', err);
        setResults([]);
        setError('Unable to find that address. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSearch = useCallback(() => {
    runSearch(query, { showEmptyError: true });
  }, [query, runSearch]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    if (!trimmed.length) {
      setResults([]);
      setError('');
      setLoading(false);
      return;
    }
    const timeout = setTimeout(() => {
      runSearch(query, { autoSelectFirst: false, showNoResultsError: false });
    }, 400);
    return () => clearTimeout(timeout);
  }, [query, runSearch, visible]);

  const handleResultPress = (item) => {
    setSelected(item);
    setSelectedAddress(item.address);
    if (item.country || item.countryCode) {
      setCountryFilter({
        name: item.country || null,
        code: item.countryCode ? item.countryCode.toUpperCase() : null,
      });
      setAllowAutoCountryFilter(true);
    }
  };

  const handleMapPress = async (coordinate) => {
    setSelected(coordinate);
    try {
      const reverse = await Location.reverseGeocodeAsync(coordinate);
      if (reverse?.length) {
        const formatted = formatAddress(reverse[0]);
        setSelected({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          country: reverse[0].country,
          countryCode: reverse[0].isoCountryCode ? reverse[0].isoCountryCode.toUpperCase() : null,
        });
        setSelectedAddress(formatted);
        if (reverse[0].country || reverse[0].isoCountryCode) {
          setCountryFilter({
            name: reverse[0].country || null,
            code: reverse[0].isoCountryCode ? reverse[0].isoCountryCode.toUpperCase() : null,
          });
          setAllowAutoCountryFilter(true);
        }
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

  const showAllCountries = () => {
    setCountryFilter(null);
    setHiddenResultsCount(0);
    setAllowAutoCountryFilter(false);
    setResults(lastRawResults);
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

  const countryFilterLabel = countryFilter?.name || countryFilter?.code || '';

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
          {countryFilterLabel && !!results.length && (
            <View style={styles.countryFilterBanner}>
              <Text style={styles.countryFilterLabel}>
                Showing suggestions in {countryFilterLabel}
              </Text>
              {hiddenResultsCount > 0 && (
                <TouchableOpacity onPress={showAllCountries} style={{ marginTop: 8 }}>
                  <Text style={styles.countryFilterAction}>
                    Show other countries ({hiddenResultsCount})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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
          {!countryFilterLabel && hiddenResultsCount > 0 && !!results.length && (
            <TouchableOpacity onPress={showAllCountries} style={{ marginTop: 8 }}>
              <Text style={styles.countryFilterAction}>
                Show other countries ({hiddenResultsCount})
              </Text>
            </TouchableOpacity>
          )}
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
  countryFilterBanner: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  countryFilterLabel: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  countryFilterAction: {
    color: '#2563EB',
    fontWeight: '600',
    textAlign: 'center',
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
